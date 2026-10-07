import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrder,scopeKey,applyObservation,assertObservation,transitionOrder,refundable,beginOperation,claimOperation,assertFence} from '../src/payments/model.mjs';
import {createMemoryPaymentStore} from '../src/payments/memory.mjs';
export const scope={merchant_id:'merchant',connection_id:'connection',provider:'square',environment:'sandbox',provider_merchant_id:'SELLER',location_id:'LOCATION'};
export const input={id:'order',scope,customer_id:'customer',offer_revision:'revision',lines:[{sku:'item',quantity:2,price:{amount:500,currency:'USD'}}]};

test('owned orders validate exact immutable commercial intent and isolate scope',()=>{
  const order=createOrder(input);assert.deepEqual(order.intent.total,{amount:1000,currency:'USD'});
  assert.throws(()=>createOrder({...input,lines:[{sku:'item',quantity:2,price:{amount:Number.MAX_SAFE_INTEGER,currency:'USD'}}]}),/overflow/);
  assert.throws(()=>createOrder({...input,lines:[...input.lines,{sku:'other',quantity:1,price:{amount:2,currency:'EUR'}}]}),/currency/);
  assert.throws(()=>createOrder({...input,scope:{...scope,environment:'test'}}),/environment/);
  assert.notEqual(scopeKey(scope),scopeKey({...scope,merchant_id:'other'}));
  assert.throws(()=>transitionOrder(order,'fulfilled'),/payment_not_completed/);
  assert.equal(transitionOrder(order,'canceled').state,'canceled');
  assert.throws(()=>transitionOrder({...order,state:'canceled'},'open'),/transition/);
});
test('payment observations enforce amount, scope, terminal state and opaque versions',()=>{
  const record={status:'created',money:{amount:1000,currency:'USD'}},observation={kind:'payment',scope,money:record.money,status:'completed',provider_id:'pay',updated_at:'2026-10-07T10:00:00Z',version_token:'opaque:z!'};
  assertObservation(scope,observation,record.money);assert.equal(applyObservation(record,observation),true);assert.equal(record.version_token,'opaque:z!');
  assert.equal(applyObservation(record,observation),false);
  assert.equal(applyObservation(record,{...observation,status:'pending',updated_at:'2026-10-07T09:00:00Z'}),false);
  assert.throws(()=>applyObservation(record,{...observation,status:'failed',updated_at:'2026-10-07T11:00:00Z'}),/conflicting/);
  assert.throws(()=>assertObservation(scope,{...observation,money:{amount:2,currency:'USD'}},record.money),/intent_conflict/);
  assert.throws(()=>assertObservation(scope,{...observation,scope:{...scope,environment:'production'}},record.money),/intent_conflict/);
});
test('pending and unknown refund reservations count against captured money',()=>{
  const order=createOrder(input);order.payments.p={status:'completed',money:order.intent.total};order.refunds.a={payment_id:'p',status:'requested',money:{amount:400,currency:'USD'}};order.refunds.b={payment_id:'p',status:'pending',money:{amount:300,currency:'USD'}};
  assert.equal(refundable(order,'p'),300);order.refunds.a.status='failed';assert.equal(refundable(order,'p'),700);
  assert.equal(order.state,'open');assert.equal(transitionOrder(order,'fulfilled').state,'fulfilled');
});
test('operation claims fence stale workers and prohibit blind unknown retries',()=>{
  const order=createOrder(input),operation=beginOperation(order,{id:'attempt',type:'payment.create',intent:{amount:1000}}),key=operation.key;
  assert.equal(beginOperation(order,{id:'attempt',type:'payment.create',intent:{amount:1000}}).key,key);
  assert.throws(()=>beginOperation(order,{id:'attempt',type:'payment.create',intent:{amount:2000}}),/conflict/);
  const first=claimOperation(operation,{now:0,leaseMs:10});assert.throws(()=>claimOperation(operation,{now:5}),/busy/);
  assert.throws(()=>claimOperation(operation,{now:11}),/unknown/);
  const second=claimOperation(operation,{now:11,reconcile:true});assert.throws(()=>assertFence(operation,first),/stale/);assertFence(operation,second);assert.equal(operation.key,key);
});
test('memory transactions roll back aggregate, receipt and outbox together',async()=>{
  const store=createMemoryPaymentStore();await store.transact(scope,'order',tx=>tx.put(createOrder(input)));
  await store.ingest(scope,{id:'event'});const receipt=await store.lease(scope);
  await assert.rejects(()=>store.transact(scope,'order',async tx=>{tx.order.state='fulfilled';await tx.complete(receipt);await tx.emit({event_id:'out'});throw new Error('crash');}),/crash/);
  assert.equal((await store.get(scope,'order')).state,'open');assert.equal((await store.outbox(scope)).length,0);assert.equal((await store.inbox(scope))[0].state,'leased');
});
