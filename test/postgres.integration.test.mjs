import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createPostgresCommerce} from '../adapters/postgres.mjs';
import {createOfferRevision} from '../src/revisions.mjs';
import {executeProviderOperation} from '../src/idempotency.mjs';
import {deliverOutbox} from '../src/downstream.mjs';
import {processNext} from '../src/durability.mjs';

const connectionString=process.env.COMMERCE_POSTGRES_URL;

test('PostgreSQL operation keys survive races, reconnects and legacy state recovery',{skip:!connectionString},async()=>{
  let pool=new pg.Pool({connectionString,max:8});const schema=`commerce_keys_${process.pid}_${Date.now()}`;
  const operation=id=>({operation_id:id,type:'subscription.create',intent:{provider:'square',merchant:'merchant_1',environment:'sandbox'}});
  try{
    let stores=createPostgresCommerce({pool,schema});await stores.migrate();
    const a=operation('a'.repeat(100)+'1'),b=operation('a'.repeat(100)+'2');
    const contenders=await Promise.all(Array.from({length:24},()=>stores.operationStore.begin(a)));
    const key=contenders[0].idempotency_key;
    assert.match(key,/^[0-9a-f-]{36}$/);assert.equal(new Set(contenders.map(row=>row.idempotency_key)).size,1);
    assert.notEqual((await stores.operationStore.begin(b)).idempotency_key,key);
    assert.notEqual((await stores.operationStore.begin({...b,operation_id:'card',type:'card.create'})).idempotency_key,key);
    for(const change of [{type:'card.create'},{intent:{...a.intent,merchant:'merchant_2'}},{intent:{...a.intent,environment:'production'}}])await assert.rejects(()=>stores.operationStore.begin({...a,...change}),/conflicts/);
    // Seed exactly the old persisted format; no new field or migration required.
    for(const state of ['not_started','succeeded','unknown','submitted'])await pool.query(`INSERT INTO ${schema}.provider_operations (operation_id,operation_type,idempotency_key,intent,state,attempts,result) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[`legacy-${state}`,'subscription.create','kujo-'+'x'.repeat(40),a.intent,state,state==='not_started'?0:1,state==='succeeded'?{id:'old-result'}:null]);
    await pool.end();pool=new pg.Pool({connectionString,max:8});stores=createPostgresCommerce({pool,schema});await stores.migrate();
    assert.equal((await stores.operationStore.begin(a)).idempotency_key,key);
    for(const state of ['not_started','succeeded','unknown','submitted']){
      const spec=operation(`legacy-${state}`);let calls=0;
      const run=()=>executeProviderOperation(spec,{store:stores.operationStore,mutate:async received=>{calls++;assert.equal(received,'kujo-'+'x'.repeat(40));return{id:'retried'};}});
      if(state==='submitted'){await assert.rejects(run,/transition/);assert.equal(calls,0);await stores.operationStore.transition(spec.operation_id,'unknown');}
      assert.equal((await run()).id,state==='succeeded'?'old-result':'retried');
      assert.equal(calls,state==='succeeded'?0:1);
      assert.equal((await stores.operationStore.get(spec.operation_id)).idempotency_key,'kujo-'+'x'.repeat(40));
    }
    let calls=0,release;const barrier=new Promise(resolve=>{release=resolve;});
    const runs=Array.from({length:12},()=>executeProviderOperation(a,{store:stores.operationStore,mutate:async received=>{calls++;assert.equal(received,key);await barrier;return{id:'one-effect'};}}));
    // Attach rejection handlers before yielding; the winner remains submitted.
    const settled=Promise.allSettled(runs);
    while(calls===0)await new Promise(resolve=>setTimeout(resolve,5));
    release();await settled;assert.equal(calls,1);
    assert.equal((await stores.operationStore.get(a.operation_id)).attempts,1);
    // An accepted provider effect with a lost local commit reuses its key.
    const crash=operation('crash-after-external-success'),effects=new Map();let breakCommit=true;
    const store={...stores.operationStore,transition:async(id,state,details)=>{if(state==='succeeded'&&breakCommit){breakCommit=false;throw new Error('commit unavailable');}return stores.operationStore.transition(id,state,details);}};
    const mutate=async received=>{if(!effects.has(received))effects.set(received,{id:'accepted'});return effects.get(received);};
    await assert.rejects(()=>executeProviderOperation(crash,{store,mutate}),/commit unavailable/);
    await pool.end();pool=new pg.Pool({connectionString,max:8});stores=createPostgresCommerce({pool,schema});
    assert.equal((await executeProviderOperation(crash,{store:stores.operationStore,mutate})).id,'accepted');assert.equal(effects.size,1);
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});

test('PostgreSQL adapter survives duplicate ingress, lease recovery, retries, and concurrent outbox workers',{skip:!connectionString},async()=>{
  const pool=new pg.Pool({connectionString,max:6}),schema=`commerce_test_${process.pid}_${Date.now()}`;
  try{
    const stores=createPostgresCommerce({pool,schema,leaseMs:100,rawEventArchive:true});await stores.migrate();
    const revision=await createOfferRevision({sku:'monthly-plan',amount:1200,currency:'USD',cadence:'monthly',provider_mapping:{square:{plan_variation_id:'PLAN123'}}},{published_at:'2026-09-19T12:00:00.000Z'});await stores.revisionStore.publish(revision);assert.equal((await stores.revisionStore.get(revision.revision_id)).amount,1200);
    const operation={operation_id:'operation_1',type:'subscription.create',idempotency_key:'stable-key',intent:{sku:'monthly-plan'}};const result=await executeProviderOperation(operation,{store:stores.operationStore,mutate:async key=>({id:'subscription_1',key})});assert.equal(result.key,'stable-key');assert.equal((await stores.operationStore.get(operation.operation_id)).state,'succeeded');assert.deepEqual(await executeProviderOperation(operation,{store:stores.operationStore,mutate:async()=>assert.fail('must not repeat')}),result);
    const rollbackEvent={provider_event_id:'rollback-event',provider:'square',type:'commerce.subscription.updated'};await pool.query(`ALTER TABLE ${schema}.queue_jobs RENAME TO queue_jobs_unavailable`);await assert.rejects(()=>stores.ingress.claimAndEnqueue(rollbackEvent),/queue_jobs/);await pool.query(`ALTER TABLE ${schema}.queue_jobs_unavailable RENAME TO queue_jobs`);assert.equal(await stores.receiptStore.get(rollbackEvent.provider_event_id),null);
    const event={provider_event_id:'provider-event-1',provider:'square',type:'commerce.subscription.updated'};const claims=await Promise.all([stores.ingress.claimAndEnqueue(event,{raw:'{"fixture":true}'}),stores.ingress.claimAndEnqueue(event,{raw:'{"fixture":true}'})]);assert.equal(claims.filter(value=>!value.duplicate).length,1);assert.equal((await stores.receiptStore.get(event.provider_event_id)).raw_body,'{"fixture":true}');await new Promise(resolve=>setTimeout(resolve,120));assert.equal((await stores.ingress.claimAndEnqueue(event)).duplicate,true);
    const first=await stores.queue.lease({leaseMs:60000});assert.equal(first.payload.provider_event_id,event.provider_event_id);await pool.query(`UPDATE ${schema}.queue_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1`,[first.id]);const reclaimed=await stores.queue.lease();assert.equal(reclaimed.id,first.id);assert.equal(reclaimed.attempt,2);await stores.queue.complete(reclaimed.id);
    await stores.queue.enqueue({provider_event_id:'failing-event',provider:'square'});const failed=await processNext({queue:stores.queue,deadLetters:stores.deadLetters,maxAttempts:1,processor:async()=>{throw new Error('consumer offline');}});assert.equal(failed.status,'dead_lettered');assert.equal((await stores.deadLetters.get(failed.job_id)).last_error,'consumer offline');
    assert.equal(await stores.replayStore.claim('signature-fingerprint'),true);assert.equal(await stores.replayStore.claim('signature-fingerprint'),false);
    await stores.reconciliationStore.putCursor('square','subscriptions',{cursor:'page-1'});assert.equal((await stores.reconciliationStore.getCursor('square','subscriptions')).cursor,'page-1');
    const downstream={schema:'kujo-commerce-downstream-event/v1',schema_version:1,event_id:'downstream-1',aggregate_id:'subscription_1',aggregate_version:1,type:'subscription.active',occurred_at:'2026-09-19T12:00:00.000Z',offer_revision:revision.revision_id,customer_reference:'customer_1',status:'active',data:{}};await stores.outbox.append(downstream);const leased=await Promise.all([stores.outbox.leasePending(10),stores.outbox.leasePending(10)]);assert.equal(leased.flat().length,1);await stores.outbox.retry('downstream-1',{delayMs:0});assert.equal((await deliverOutbox({outbox:stores.outbox,publisher:{publish:async()=>{throw new Error('consumer offline');}},deadLetters:stores.deadLetters,retryDelayMs:0}))[0].status,'retrying');const deliveries=await deliverOutbox({outbox:stores.outbox,publisher:{publish:async()=>{}},deadLetters:stores.deadLetters});assert.equal(deliveries[0].status,'delivered');await stores.deadLetters.put({kind:'downstream_delivery',id:failed.job_id,payload:downstream,attempt:5},new Error('consumer offline'));assert.equal((await stores.deadLetters.get(failed.job_id)).kind,'event_processing');assert.equal((await stores.deadLetters.get(failed.job_id,'downstream_delivery')).kind,'downstream_delivery');
    assert.equal((await stores.consumerStore.accept({fingerprint:'fingerprint-1',event:downstream})).accepted,true);assert.equal((await stores.consumerStore.accept({fingerprint:'fingerprint-1',event:downstream})).duplicate,true);assert.equal((await stores.consumerStore.list()).length,1);
    await stores.audit({action:'event.replay',actor:'integration-test',occurred_at:'2026-09-19T12:00:00.000Z'});assert.equal(Number((await pool.query(`SELECT count(*) FROM ${schema}.operator_audit`)).rows[0].count),1);
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
