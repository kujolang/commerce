import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaymentHandlers} from '../runtime/payments.mjs';
import {createPaymentService,createMemoryPaymentStore} from '../src/payments/index.mjs';
import {providerFor} from '../src/providers.mjs';
import {scope,input,squareFixture} from './fixtures/owned-payments.mjs';

test('payment HTTP requires authentication, ownership, CSRF origin and server pricing',async()=>{
  const fixture=squareFixture(),store=createMemoryPaymentStore(),service=createPaymentService({store,provider:providerFor('square'),scope,config:{location_id:'LOCATION'},env:{SQUARE_ACCESS_TOKEN:'fixture'},context:{fetch:fixture.fetch}});
  let principal={id:'actor',merchant_id:'merchant',customer_id:'customer'},limited=false;
  const handlers=createPaymentHandlers({service,origin:'https://site.test',applicationId:'app',authorize:async()=>principal,rateLimit:async()=>!limited,resolveOrder:async({items})=>{assert.deepEqual(items,[{sku:'item',quantity:2}]);return input;}});
  const request=(body,origin='https://site.test')=>new Request('https://site.test/pay',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await handlers.session(request({items:[]},'https://evil.test'))).status,403);
  principal=null;assert.equal((await handlers.session(request({items:[]}))).status,401);
  principal={id:'actor',merchant_id:'merchant',customer_id:'customer'};
  const session=await handlers.session(request({items:[{sku:'item',quantity:2}],amount:1}));assert.equal(session.status,201);const details=await session.json();assert.equal(details.amount,'10.00');assert.ok(!JSON.stringify(details).includes('SQUARE_ACCESS_TOKEN'));
  principal={...principal,customer_id:'other'};assert.equal((await handlers.pay(request({order_id:'order',source_token:'source'}))).status,404);
  principal={...principal,customer_id:'customer'};limited=true;assert.equal((await handlers.pay(request({order_id:'order',source_token:'source'}))).status,429);limited=false;
  assert.equal((await handlers.pay(request({order_id:'order',source_token:'source',amount:1,attempt_id:'attacker'}))).status,201);assert.equal(fixture.calls[0].body.amount_money.amount,1000);
  assert.equal((await handlers.refund(request({order_id:'order',amount:1000}))).status,403);
  const status=await handlers.status(new Request('https://site.test/status?order_id=order'));assert.equal(status.status,200);assert.ok(!JSON.stringify(await status.json()).includes('source'));
});
test('expired checkout cannot create a payment and source token is not passed to authorization',async()=>{
  const fixture=squareFixture(),store=createMemoryPaymentStore(),service=createPaymentService({store,provider:providerFor('square'),scope,config:{location_id:'LOCATION'},env:{SQUARE_ACCESS_TOKEN:'fixture'},context:{fetch:fixture.fetch},now:()=>0});await service.create(input);
  const handlers=createPaymentHandlers({service,origin:'https://site.test',authorize:async(_request,context)=>{assert.ok(!JSON.stringify(context).includes('transient'));return{id:'actor',merchant_id:'merchant',customer_id:'customer'};},rateLimit:async()=>true,now:()=>1e9});
  const result=await handlers.pay(new Request('https://site.test/pay',{method:'POST',headers:{origin:'https://site.test','content-type':'application/json'},body:JSON.stringify({order_id:'order',source_token:'transient'})}));assert.equal(result.status,409);assert.equal(fixture.calls.length,0);
});
