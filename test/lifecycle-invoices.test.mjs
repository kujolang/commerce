import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryPaymentStore,createPaymentService,createLifecycleService,createInvoiceService} from '../src/payments/index.mjs';
import {providerFor} from '../src/providers.mjs';
import {scope,input} from './fixtures/owned-payments.mjs';
const consent={id:'consent',customer_reference:'customer',checkout_reference:'order',text_version:'v1',occurred_at:'2026-10-07T10:00:00Z',storage_authorized:true,recurring_authorized:false};

test('card storage consent is independent, recurring requires additional consent and enabled customer card',async()=>{
  const store=createMemoryPaymentStore(),calls=[],provider=providerFor('square');let enabled=true;
  const context={fetch:async(url,options)=>{calls.push({url,body:options.body&&JSON.parse(options.body)});if(url.includes('/v2/catalog/object/'))return Response.json({object:{id:'PLAN',type:'SUBSCRIPTION_PLAN_VARIATION',subscription_plan_variation_data:{phases:[{cadence:'MONTHLY',pricing:{type:'STATIC',price_money:{amount:1000,currency:'USD'}}}]}}});if(url.endsWith('/v2/subscriptions'))return Response.json({subscription:{id:'subscription',status:'ACTIVE',customer_id:'CUSTOMER',version:1}});if(url.endsWith('/disable'))enabled=false;return Response.json({card:{id:'card',customer_id:'CUSTOMER',card_brand:'VISA',last_4:'1111',enabled}});}},config={location_id:'LOCATION'},env={SQUARE_ACCESS_TOKEN:'fixture'},options={store,scope,provider,config,env,context};
  await createPaymentService(options).create(input);const lifecycle=createLifecycleService(options);
  assert.equal((await lifecycle.saveCard({orderId:'order',operationId:'store',customerId:'CUSTOMER',sourceToken:'transient-source',consent})).last_4,'1111');
  await assert.rejects(()=>lifecycle.enroll({orderId:'order',operationId:'enroll',customerId:'CUSTOMER',cardId:'card',planVariationId:'PLAN',consent}),/recurring_consent/);
  assert.equal((await lifecycle.enroll({orderId:'order',operationId:'enroll',customerId:'CUSTOMER',cardId:'card',planVariationId:'PLAN',consent:{...consent,recurring_authorized:true,recurring:{money:{amount:1000,currency:'USD'},cadence:'MONTHLY',plan_variation_id:'PLAN',offer_revision:input.offer_revision}}})).status,'active');
  await lifecycle.disableCard({orderId:'order',operationId:'disable',customerId:'CUSTOMER',cardId:'card'});
  await assert.rejects(()=>lifecycle.enroll({orderId:'order',operationId:'other-enroll',customerId:'CUSTOMER',cardId:'card',planVariationId:'PLAN',consent:{...consent,recurring_authorized:true,recurring:{money:{amount:1000,currency:'USD'},cadence:'MONTHLY',plan_variation_id:'PLAN',offer_revision:input.offer_revision}}}),/payment_unresolved/);
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

test('a second invoice approval and local cancellation cannot bypass an uncertain collection route',async()=>{
  const store=createMemoryPaymentStore(),provider=providerFor('square'),context={fetch:async()=>{throw new Error('lost response');}},options={store,provider,scope,config:{location_id:'LOCATION'},env:{SQUARE_ACCESS_TOKEN:'fixture'},context},payments=createPaymentService(options);await payments.create(input);const invoices=createInvoiceService(options),args={orderId:'order',customerId:'CUSTOMER',dueDate:'2030-01-01'};
  await assert.rejects(()=>invoices.draft({...args,approvalId:'first'}));
  await assert.rejects(()=>invoices.draft({...args,approvalId:'second'}),/unresolved/);
  await assert.rejects(()=>payments.setOrderState('order','canceled'),/collection_unresolved/);
});

test('recurring enrollment rejects remote price drift before creating a subscription',async()=>{
  const store=createMemoryPaymentStore(),provider=providerFor('square');let mutations=0;
  const options={store,scope,provider,config:{location_id:'LOCATION'},env:{SQUARE_ACCESS_TOKEN:'fixture'},context:{fetch:async(url,options)=>{
    if(options.method==='POST')mutations++;
    return Response.json(url.includes('/cards/')?{card:{id:'card',customer_id:'CUSTOMER',enabled:true}}:{object:{id:'PLAN',type:'SUBSCRIPTION_PLAN_VARIATION',subscription_plan_variation_data:{phases:[{cadence:'MONTHLY',pricing:{type:'STATIC',price_money:{amount:2000,currency:'USD'}}}]}}});
  }}};
  await createPaymentService(options).create(input);
  await assert.rejects(()=>createLifecycleService(options).enroll({orderId:'order',operationId:'enroll',customerId:'CUSTOMER',cardId:'card',planVariationId:'PLAN',consent:{...consent,recurring_authorized:true,recurring:{money:{amount:1000,currency:'USD'},cadence:'MONTHLY',plan_variation_id:'PLAN',offer_revision:'revision'}}}),/intent_conflict/);
  assert.equal(mutations,0);
});

test('invoice reconciliation rejects wrong order and partial PAID claims, then permits explicit fulfillment',async()=>{
  const store=createMemoryPaymentStore();let current;
  const provider={id:'square',createOrder:async()=>({id:'remote',location_id:'LOCATION',total_money:{amount:1000,currency:'USD'}}),createInvoice:async()=>({id:'invoice',order_id:'remote',location_id:'LOCATION',status:'DRAFT',version:0}),retrieveInvoice:async()=>current};
  const options={store,scope,provider,config:{location_id:'LOCATION'}},service=createPaymentService(options),invoices=createInvoiceService(options);await service.create(input);await invoices.draft({orderId:'order',approvalId:'approval',customerId:'CUSTOMER',dueDate:'2030-01-01'});
  current={id:'invoice',order_id:'wrong',location_id:'LOCATION',version:1,status:'PAID',payment_requests:[{total_completed_amount_money:{amount:1000,currency:'USD'}}]};
  await assert.rejects(()=>invoices.retrieve({orderId:'order',invoiceId:'invoice'}),/reference_mismatch/);
  current.order_id='remote';current.payment_requests[0].total_completed_amount_money.amount=500;
  await assert.rejects(()=>invoices.retrieve({orderId:'order',invoiceId:'invoice'}),/money_mismatch/);
  current.status='PARTIALLY_PAID';await invoices.retrieve({orderId:'order',invoiceId:'invoice'});await assert.rejects(()=>service.setOrderState('order','fulfilled'),/not_completed/);
  current={...current,version:2,status:'PAID',payment_requests:[{total_completed_amount_money:{amount:1000,currency:'USD'}}]};await invoices.retrieve({orderId:'order',invoiceId:'invoice'});assert.equal((await service.get('order')).state,'open');assert.equal((await service.setOrderState('order','fulfilled')).state,'fulfilled');
});
