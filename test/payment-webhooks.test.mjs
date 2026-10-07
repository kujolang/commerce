import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaymentService,createMemoryPaymentStore,createSquarePaymentWebhook,processPaymentWebhook} from '../src/payments/index.mjs';
import {providerFor} from '../src/providers.mjs';
import {hmacSha256} from '../src/provider-utils.mjs';
import {scope,input,squareFixture} from './fixtures/owned-payments.mjs';

test('signed scoped webhook ingress is atomic, deduplicated and reconciles current state',async()=>{
  const fixture=squareFixture(),store=createMemoryPaymentStore(),provider=providerFor('square'),config={location_id:'LOCATION'},env={SQUARE_ACCESS_TOKEN:'fixture'},context={fetch:fixture.fetch},service=createPaymentService({store,provider,scope,config,env,context});
  await service.create(input);const paid=await service.pay({orderId:'order',attemptId:'attempt',sourceToken:'source',autocomplete:false});
  const remote=[...fixture.payments.values()][0];remote.status='COMPLETED';remote.updated_at='2026-10-07T11:00:00Z';
  const notificationUrl='https://site.test/webhooks/square',secret='fixture-secret',handler=createSquarePaymentWebhook({store,scope,secret,notificationUrl});
  const payload={event_id:'event',type:'payment.updated',merchant_id:'SELLER',data:{id:paid.provider_id,object:{payment:{id:paid.provider_id,status:'PENDING',location_id:'LOCATION'}}}};
  const send=async(value=payload,bad=false)=>{const raw=JSON.stringify(value),signature=await hmacSha256(secret,notificationUrl+raw,'base64');return handler(new Request(notificationUrl,{method:'POST',headers:{'x-square-hmacsha256-signature':bad?'bad':signature},body:raw}));};
  assert.equal((await send(payload,true)).status,401);assert.equal((await store.inbox(scope)).length,0);
  assert.equal((await send({...payload,merchant_id:'OTHER'})).status,403);
  const responses=await Promise.all([send(),send()]);assert.deepEqual(responses.map(response=>response.status).sort(),[200,202]);
  assert.equal((await processPaymentWebhook({store,service,provider,config,env,context})).status,'processed');
  assert.equal((await service.get('order')).payments[paid.local_id].status,'completed');assert.equal((await service.get('order')).state,'open');
  assert.equal((await store.inbox(scope))[0].state,'processed');assert.equal((await send()).status,200);
  assert.equal(await processPaymentWebhook({store,service,provider,config,env,context}),null);
  assert.equal((await send({...payload,event_id:'unknown',type:'payment.updated.COMPLETED'})).status,204);
});

test('late fee observations update the ledger without emitting a second payment completion',async()=>{
  const fixture=squareFixture(),store=createMemoryPaymentStore(),provider=providerFor('square'),service=createPaymentService({store,provider,scope,config:{location_id:'LOCATION'},env:{SQUARE_ACCESS_TOKEN:'fixture'},context:{fetch:fixture.fetch}});await service.create(input);const paid=await service.pay({orderId:'order',attemptId:'a',sourceToken:'source'});
  const remote=[...fixture.payments.values()][0];remote.updated_at='2026-10-07T12:00:00Z';remote.processing_fee=[{type:'INITIAL',effective_at:remote.updated_at,amount_money:{amount:-31,currency:'USD'}}];
  await service.observe({orderId:'order',localId:paid.local_id,observation:provider.paymentObservation(remote,scope)});
  assert.equal((await store.outbox(scope)).filter(row=>row.event.type==='payment.completed').length,1);
  assert.equal((await service.get('order')).payments[paid.local_id].financials.processing_fees[0].amount_money.amount,-31);
});
