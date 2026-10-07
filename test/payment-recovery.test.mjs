import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryPaymentStore,createPaymentService,reconcileOwnedOrders,publishPaymentOutbox} from '../src/payments/index.mjs';
import {providerFor} from '../src/providers.mjs';
import {scope,input,squareFixture} from './fixtures/owned-payments.mjs';

test('recovery cursor resumes inside an order and outbox redelivery preserves event ID',async()=>{
  const store=createMemoryPaymentStore(),fixture=squareFixture(),service=createPaymentService({store,scope,provider:providerFor('square'),config:{location_id:scope.location_id},env:{SQUARE_ACCESS_TOKEN:'fixture'},context:{fetch:fixture.fetch}});
  await service.create(input);const paid=await service.pay({orderId:'order',attemptId:'pay',sourceToken:'source'});await service.refund({orderId:'order',paymentId:paid.local_id,refundId:'refund',amount:100});
  const first=await reconcileOwnedOrders({store,service,maxOperations:1});assert.equal(first.results.length,1);assert.ok(first.next_cursor.operation_key);
  const second=await reconcileOwnedOrders({store,service,cursor:first.next_cursor,maxOperations:1});assert.equal(second.results.length,1);assert.notEqual(first.results[0].operation_id,second.results[0].operation_id);
  const third=await reconcileOwnedOrders({store,service,cursor:second.next_cursor});assert.equal(third.next_cursor,null);
  let id;const failed=await publishPaymentOutbox({store,scope,limit:1,publisher:{publish:async event=>{id=event.event_id;throw Error('temporary');}}});assert.equal(failed[0].status,'retrying');
  const retried=await publishPaymentOutbox({store,scope,limit:1,publisher:{publish:async event=>assert.equal(event.event_id,id)}});assert.equal(retried[0].status,'delivered');
});
test('dead receipt replay is audited and cannot be repeated while ready',async()=>{
  const store=createMemoryPaymentStore();await store.ingest(scope,{id:'event'});const receipt=await store.lease(scope);await store.retry(scope,receipt,{maxAttempts:1});
  await store.replay(scope,'event','operator');await assert.rejects(()=>store.replay(scope,'event','operator'),/not_dead/);
  assert.equal((await store.outbox(scope))[0].event.data.actor,'operator');
});
