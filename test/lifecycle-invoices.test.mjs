import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryPaymentStore,createPaymentService,createLifecycleService,createInvoiceService} from '../src/payments/index.mjs';
import {providerFor} from '../src/providers.mjs';
import {scope,input} from './fixtures/owned-payments.mjs';
const consent={id:'consent',customer_reference:'customer',checkout_reference:'order',text_version:'v1',occurred_at:'2026-10-07T10:00:00Z',storage_authorized:true,recurring_authorized:false};

test('card storage consent is independent, recurring requires additional consent and enabled customer card',async()=>{
  const store=createMemoryPaymentStore(),calls=[],provider=providerFor('square');let enabled=true;
  const context={fetch:async(url,options)=>{calls.push({url,body:options.body&&JSON.parse(options.body)});if(url.endsWith('/v2/subscriptions'))return Response.json({subscription:{id:'subscription',status:'ACTIVE',customer_id:'CUSTOMER',version:1}});if(url.endsWith('/disable'))enabled=false;return Response.json({card:{id:'card',customer_id:'CUSTOMER',card_brand:'VISA',last_4:'1111',enabled}});}},config={location_id:'LOCATION'},env={SQUARE_ACCESS_TOKEN:'fixture'},options={store,scope,provider,config,env,context};
  await createPaymentService(options).create(input);const lifecycle=createLifecycleService(options);
  assert.equal((await lifecycle.saveCard({orderId:'order',operationId:'store',customerId:'CUSTOMER',sourceToken:'transient-source',consent})).last_4,'1111');
  await assert.rejects(()=>lifecycle.enroll({orderId:'order',operationId:'enroll',customerId:'CUSTOMER',cardId:'card',planVariationId:'PLAN',consent}),/recurring_consent/);
  assert.equal((await lifecycle.enroll({orderId:'order',operationId:'enroll',customerId:'CUSTOMER',cardId:'card',planVariationId:'PLAN',consent:{...consent,recurring_authorized:true}})).status,'active');
  await lifecycle.disableCard({orderId:'order',operationId:'disable',customerId:'CUSTOMER',cardId:'card'});
  await assert.rejects(()=>lifecycle.enroll({orderId:'order',operationId:'other-enroll',customerId:'CUSTOMER',cardId:'card',planVariationId:'PLAN',consent:{...consent,recurring_authorized:true}}),/saved_card_unavailable/);
  assert.ok(!JSON.stringify(await store.get(scope,'order')).includes('transient-source'));
  assert.notEqual(calls[0].body.idempotency_key,calls.find(call=>call.url.endsWith('/v2/subscriptions')).body.idempotency_key);
});
test('approved invoice draft and publication have distinct durable keys, deposit intent and exclusive route',async()=>{
  const store=createMemoryPaymentStore(),provider=providerFor('square'),calls=[];let version=0;
  const context={fetch:async(url,options)=>{const body=options.body?JSON.parse(options.body):{};calls.push({url,body});if(url.endsWith('/v2/orders'))return Response.json({order:{id:'remote-order',location_id:'LOCATION',total_money:{amount:1000,currency:'USD'}}});if(url.endsWith('/publish'))version=1;return Response.json({invoice:{id:'invoice',order_id:'remote-order',location_id:'LOCATION',version,status:version?'UNPAID':'DRAFT',payment_requests:body.invoice?.payment_requests||[]}});}},options={store,provider,scope,config:{location_id:'LOCATION'},env:{SQUARE_ACCESS_TOKEN:'fixture'},context};
  const payments=createPaymentService(options);await payments.create(input);const invoices=createInvoiceService(options);
  const args={orderId:'order',approvalId:'approval',customerId:'CUSTOMER',dueDate:'2030-01-01',depositAmount:200};
  const draft=await invoices.draft(args);assert.equal(draft.status,'DRAFT');await invoices.draft(args);assert.equal(calls.length,2);
  assert.equal(calls[1].body.invoice.payment_requests[0].request_type,'DEPOSIT');assert.equal(calls[1].body.invoice.payment_requests[0].automatic_payment_source,'NONE');
  assert.equal((await invoices.publish({orderId:'order',operationId:'publish',invoiceId:draft.id,version:draft.version})).status,'UNPAID');assert.equal(new Set(calls.map(call=>call.body.idempotency_key)).size,3);
  await assert.rejects(()=>payments.pay({orderId:'order',attemptId:'second-route',sourceToken:'source'}),/unresolved/);
  await assert.rejects(()=>invoices.publish({orderId:'order',operationId:'unbound',invoiceId:'other',version:0}),/not_bound/);
});
