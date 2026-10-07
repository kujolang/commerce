import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createPostgresPaymentStore} from '../adapters/postgres-payments.mjs';
import {createPaymentService} from '../src/payments/service.mjs';
import {providerFor} from '../src/providers.mjs';
import {scope,input,squareFixture} from './fixtures/owned-payments.mjs';
const connectionString=process.env.COMMERCE_POSTGRES_URL;

test('owned PostgreSQL atomic transitions, refund races, scope isolation and source-free restart recovery',{skip:!connectionString},async()=>{
  let pool=new pg.Pool({connectionString,max:8});const schema=`owned_test_${process.pid}_${Date.now()}`,fixture=squareFixture();
  const connect=()=>{const store=createPostgresPaymentStore({pool,schema});const service=createPaymentService({store,provider:providerFor('square'),scope,config:{location_id:'LOCATION'},env:{SQUARE_ACCESS_TOKEN:'fixture'},context:{fetch:fixture.fetch}});return {store,service};};
  try{
    let {store,service}=connect();await store.migrate();await store.migrate();
    await Promise.all(Array.from({length:10},()=>service.create(input)));assert.equal((await store.outbox(scope)).length,1);
    const payments=await Promise.allSettled(Array.from({length:8},()=>service.pay({orderId:'order',attemptId:'a',sourceToken:'transient-source'})));
    assert.equal(fixture.payments.size,1);const paid=payments.find(result=>result.status==='fulfilled').value;
    const refunds=await Promise.allSettled(['r1','r2'].map(refundId=>service.refund({orderId:'order',paymentId:paid.local_id,refundId,amount:700})));
    assert.equal(refunds.filter(result=>result.status==='fulfilled').length,1);assert.equal(fixture.refunds.size,1);
    const otherScope={...scope,merchant_id:'other'};assert.equal(await store.get(otherScope,'order'),null);
    const event={id:'same-event'};assert.deepEqual(await store.ingest(scope,event),{duplicate:false});assert.deepEqual(await store.ingest(otherScope,event),{duplicate:false});assert.deepEqual(await store.ingest(scope,event),{duplicate:true});
    const receipt=await store.lease(scope),before=await store.get(scope,'order');
    await assert.rejects(()=>store.transact(scope,'order',async tx=>{tx.order.state='fulfilled';await tx.complete(receipt);await tx.emit({event_id:'rolled-back'});throw new Error('crash');}),/crash/);
    assert.deepEqual(await store.get(scope,'order'),before);assert.ok(!(await store.outbox(scope)).some(row=>row.event.event_id==='rolled-back'));assert.equal((await store.inbox(scope))[0].state,'leased');
    await pool.query(`UPDATE ${schema}.owned_inbox SET lease_until=now()-interval '1 second' WHERE state='leased'`);
    const replacement=await store.lease(scope);assert.ok(replacement.generation>receipt.generation);
    await assert.rejects(()=>store.transact(scope,'order',tx=>tx.complete(receipt)),/stale_receipt/);
    await store.transact(scope,'order',tx=>tx.complete(replacement));
    await service.create({...input,id:'crash-order'});fixture.lose();await assert.rejects(()=>service.pay({orderId:'crash-order',attemptId:'crash-attempt',sourceToken:'never-persist'}));
    const snapshot=JSON.stringify(await store.get(scope,'crash-order'));assert.ok(!snapshot.includes('never-persist'));
    await pool.end();pool=new pg.Pool({connectionString,max:8});({store,service}=connect());
    const recovered=await service.reconcile({orderId:'crash-order',attemptId:'crash-attempt'});assert.equal(recovered.status,'completed');assert.equal(fixture.payments.size,2);
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});

test('owned PostgreSQL no-op reconciliation avoids tuple writes and pending delivery uses its partial index',{skip:!connectionString},async()=>{
  const pool=new pg.Pool({connectionString}),schema=`owned_perf_${process.pid}_${Date.now()}`,store=createPostgresPaymentStore({pool,schema});
  const {scopeKey}=await import('../src/payments/model.mjs');const partition=scopeKey(scope);
  try{
    await store.migrate();await store.transact(scope,'order',tx=>tx.put({id:'order',version:1}));
    const tuple=async()=>(await pool.query(`SELECT xmin::text AS revision FROM ${schema}.owned_orders WHERE scope=$1 AND id='order'`,[partition])).rows[0].revision;
    const original=await tuple();for(let count=0;count<20;count++)await store.transact(scope,'order',tx=>tx.order.version);
    assert.equal(await tuple(),original,'read/no-change transactions must not create new tuples');
    await store.transact(scope,'order',tx=>{tx.order.version++;});assert.notEqual(await tuple(),original);
    await pool.query(`INSERT INTO ${schema}.owned_outbox(scope,event_id,event,state) SELECT $1,'seed-'||i,jsonb_build_object('event_id','seed-'||i),CASE WHEN i<=10 THEN 'pending' ELSE 'delivered' END FROM generate_series(1,5000) i`,[partition]);
    await pool.query(`ANALYZE ${schema}.owned_outbox`);
    const plan=(await pool.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT event,state FROM ${schema}.owned_outbox WHERE scope=$1 AND state='pending' ORDER BY created_at,event_id LIMIT 5`,[partition])).rows[0]['QUERY PLAN'];
    assert.match(JSON.stringify(plan),/owned_outbox_pending/);assert.equal((await store.outbox(scope,{pending:true,limit:5})).length,5);
    assert.equal((await store.outbox({...scope,merchant_id:'other'},{pending:true})).length,0);
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
