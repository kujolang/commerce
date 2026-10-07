import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteApplicationFee} from '../src/payments/fees.mjs';
import {scope,input,squareFixture} from './fixtures/owned-payments.mjs';
import {providerFor} from '../src/providers.mjs';
import {createPaymentService,createMemoryPaymentStore} from '../src/payments/index.mjs';
const permission='PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS';
const policy={enabled:true,id:'policy',approval_reference:'approval',merchant_consent_reference:'consent',provider_merchant_id:'SELLER',environment:'sandbox',permissions:[permission],basis_points:1000,fixed_amount:0,seller_country:'US',developer_location_id:'DEVELOPER',recipients:[{location_id:'DEVELOPER',country:'US',currency:'USD',permissions:[permission],basis_points:5000},{location_id:'PARTNER',country:'US',currency:'USD',permissions:[permission],basis_points:5000}]};
test('fees are disabled by default, authorized, exact and independently allocated',()=>{
  assert.equal(quoteApplicationFee(undefined,{amount:1000,currency:'USD'},scope),null);
  const value=quoteApplicationFee(policy,{amount:1010,currency:'USD'},scope);assert.equal(value.amount_money.amount,101);assert.deepEqual(value.allocations.map(allocation=>allocation.amount_money.amount),[50,51]);
  for(const changed of [{permissions:[]},{approval_reference:null},{environment:'production'},{basis_points:10000},{recipients:[{...policy.recipients[0],basis_points:10000,country:'CA'}]}])assert.throws(()=>quoteApplicationFee({...policy,...changed},{amount:1000,currency:'USD'},scope));
});
test('fee intent reaches Square only through enabled server policy and remains immutable',async()=>{
  const fixture=squareFixture(),store=createMemoryPaymentStore(),options={store,provider:providerFor('square'),scope,config:{location_id:'LOCATION',fee_policy:policy},env:{SQUARE_ACCESS_TOKEN:'fixture'},context:{fetch:fixture.fetch}},service=createPaymentService(options);await service.create(input);await service.pay({orderId:'order',attemptId:'attempt',sourceToken:'source'});
  assert.equal(fixture.calls[0].body.app_fee_money.amount,100);assert.equal(fixture.calls[0].body.app_fee_allocations.length,2);
  const changed=createPaymentService({...options,config:{...options.config,fee_policy:{...policy,basis_points:2000}}});await assert.rejects(()=>changed.pay({orderId:'order',attemptId:'attempt',sourceToken:'source'}),/intent_conflict/);
});
