import test from 'node:test';
import assert from 'node:assert/strict';
import {providerFor} from '../src/providers.mjs';
import {createPaymentService,createMemoryPaymentStore} from '../src/payments/index.mjs';
import {scope,input,squareFixture} from './fixtures/owned-payments.mjs';
const setup=()=>{const store=createMemoryPaymentStore(),fixture=squareFixture(),service=createPaymentService({store,provider:providerFor('square'),scope,config:{location_id:'LOCATION'},env:{SQUARE_ACCESS_TOKEN:'fixture'},context:{fetch:fixture.fetch}});return {store,fixture,service};};

test('owned payment and pending partial refund use persisted distinct keys without fulfilling order',async()=>{
  const {store,fixture,service}=setup();await service.create(input);
  const paid=await service.pay({orderId:'order',attemptId:'attempt',sourceToken:'single-use-secret'});
  assert.equal(paid.status,'completed');assert.equal((await service.get('order')).state,'open');
  assert.deepEqual(await service.pay({orderId:'order',attemptId:'attempt',sourceToken:'ignored'}),paid);assert.equal(fixture.payments.size,1);
  const refund=await service.refund({orderId:'order',paymentId:paid.local_id,refundId:'refund1',amount:400});assert.equal(refund.status,'pending');
  assert.equal((await service.refund({orderId:'order',paymentId:paid.local_id,refundId:'refund1',amount:400})).provider_id,refund.provider_id);
  await assert.rejects(()=>service.refund({orderId:'order',paymentId:paid.local_id,refundId:'refund2',amount:700}),/refund_exceeds/);
  await assert.rejects(()=>service.refund({orderId:'order',paymentId:paid.local_id,refundId:'refund1',amount:200}),/conflict/);
  assert.notEqual(fixture.calls[0].body.idempotency_key,fixture.calls[1].body.idempotency_key);
  assert.ok(!JSON.stringify(await store.get(scope,'order')).includes('single-use-secret'));assert.ok(!JSON.stringify(await store.outbox(scope)).includes('single-use-secret'));
});
test('lost payment response survives source loss and recovers by reference without resubmission',async()=>{
  const {fixture,service}=setup();await service.create(input);fixture.lose();
  await assert.rejects(()=>service.pay({orderId:'order',attemptId:'attempt',sourceToken:'source'}),/outcome is unknown/);
  await assert.rejects(()=>service.pay({orderId:'order',attemptId:'attempt',sourceToken:'new-source'}),/outcome_unknown/);
  await assert.rejects(()=>service.pay({orderId:'order',attemptId:'new-attempt',mode:'hosted'}),/payment_unresolved/);
  const recovered=await service.reconcile({orderId:'order',attemptId:'attempt'});assert.equal(recovered.status,'completed');assert.equal(fixture.payments.size,1);
  assert.equal(fixture.calls.filter(call=>call.path==='/v2/payments'&&call.body.source_id).length,1);
});
test('ambiguous and absent recovery remains unknown and blocks second routes',async()=>{
  const {fixture,service}=setup();await service.create(input);fixture.lose();await assert.rejects(()=>service.pay({orderId:'order',attemptId:'attempt',sourceToken:'source'}));
  const remote=[...fixture.payments.values()][0];fixture.payments.clear();await assert.rejects(()=>service.reconcile({orderId:'order',attemptId:'attempt'}),/outcome_unknown/);
  fixture.payments.set('a',remote);fixture.payments.set('b',{...remote,id:'second'});await assert.rejects(()=>service.reconcile({orderId:'order',attemptId:'attempt'}),/ambiguous/);
  await assert.rejects(()=>service.pay({orderId:'order',attemptId:'new',mode:'hosted'}),/unresolved/);
});
test('definitive decline releases route without storing provider private diagnostics',async()=>{
  const {fixture,service,store}=setup();await service.create(input);fixture.decline();await assert.rejects(()=>service.pay({orderId:'order',attemptId:'a',sourceToken:'source'}),/card_declined/);
  assert.equal(Object.values((await service.get('order')).payments)[0].status,'failed');assert.ok(!JSON.stringify(await store.get(scope,'order')).includes('private provider'));
});
test('hosted checkout binds remote order and local total and prevents route switching',async()=>{
  const {service}=setup();await service.create(input);const link=await service.pay({orderId:'order',attemptId:'hosted',mode:'hosted'});assert.equal(link.provider_order_id,'square-order');
  await assert.rejects(()=>service.pay({orderId:'order',attemptId:'embedded',sourceToken:'source'}),/unresolved/);
});
test('protocol rejects unofficial origins, follows no redirects, and redacts error bodies',async()=>{
  const provider=providerFor('square');let calls=0;
  await assert.rejects(()=>provider.retrievePayment('id',{api_base:'https://attacker.test'},{SQUARE_ACCESS_TOKEN:'secret'},{fetch:async()=>{calls++;}}),/official/);assert.equal(calls,0);
  await assert.rejects(()=>provider.retrievePayment('id',{}, {SQUARE_ACCESS_TOKEN:'fixture'}, {fetch:async(_url,options)=>{assert.equal(options.redirect,'error');return new Response(JSON.stringify({errors:[{code:'BAD_REQUEST',detail:'do not echo secret'}]}),{status:400});}}),error=>!error.message.includes('secret')&&error.code==='invalid_request');
});

test('delayed capture and cancellation preserve local identity and observed terminal state',async()=>{
  for(const action of ['capture','cancel']){
    const {service,fixture}=setup();await service.create(input);
    const authorized=await service.pay({orderId:'order',attemptId:'authorize',sourceToken:'source',autocomplete:false});assert.equal(authorized.status,'authorized');
    const result=await service.changePayment({orderId:'order',paymentId:authorized.local_id,action,operationId:action});assert.equal(result.status,action==='capture'?'completed':'canceled');
    assert.deepEqual(await service.changePayment({orderId:'order',paymentId:authorized.local_id,action,operationId:action}),result);
    assert.equal(fixture.calls.filter(call=>call.path.endsWith(action==='capture'?'/complete':'/cancel')).length,1);
  }
});

test('unknown create cannot be bypassed by canceling the local order',async()=>{
  const {service,fixture}=setup();await service.create(input);fixture.lose();
  await assert.rejects(()=>service.pay({orderId:'order',attemptId:'attempt',sourceToken:'source'}));
  await assert.rejects(()=>service.setOrderState('order','canceled'),/payment_unresolved/);
  await assert.rejects(()=>service.reconcile({orderId:'order',attemptId:'attempt',type:'untrusted'}),/unsupported_reconciliation_type/);
  assert.equal((await service.reconcile({orderId:'order',attemptId:'attempt'})).status,'completed');
});

test('a late API error cannot overwrite a payment already observed through another worker',async()=>{
  const store=createMemoryPaymentStore(),fixture=squareFixture(),square=providerFor('square');let service;
  const provider={...square,createPayment:async(...args)=>{
    const remote=await square.createPayment(...args),order=await service.get('order');
    await service.observe({orderId:'order',localId:order.active_payment_id,observation:square.paymentObservation(remote,scope)});
    throw Object.assign(Error('late conflicting response'),{code:'card_declined',definitive:true});
  }};
  service=createPaymentService({store,provider,scope,config:{location_id:'LOCATION'},env:{SQUARE_ACCESS_TOKEN:'fixture'},context:{fetch:fixture.fetch}});await service.create(input);
  await assert.rejects(()=>service.pay({orderId:'order',attemptId:'a',sourceToken:'source'}),error=>error.code==='outcome_unknown');
  const order=await service.get('order');assert.equal(order.payments[order.active_payment_id].status,'completed');assert.equal(Object.values(order.operations)[0].state,'unknown');
  assert.equal((await service.reconcile({orderId:'order',attemptId:'a'})).status,'completed');
});
