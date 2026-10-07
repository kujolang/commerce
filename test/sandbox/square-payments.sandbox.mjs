import test from 'node:test';
import assert from 'node:assert/strict';
import {providerFor} from '../../src/providers.mjs';
const skip=process.env.COMMERCE_RUN_MUTATING_SANDBOX!=='true'||!process.env.SQUARE_ACCESS_TOKEN||!process.env.SQUARE_LOCATION_ID;
const provider=providerFor('square'),config={api_base:'https://connect.squareupsandbox.com',location_id:process.env.SQUARE_LOCATION_ID};
const create=async(autocomplete=true,source_id='cnon:card-nonce-ok')=>{
  const input={source_id,money:{amount:100,currency:'USD'},reference_id:crypto.randomUUID(),autocomplete},context={idempotencyKey:crypto.randomUUID()};
  const payment=await provider.createPayment(input,config,process.env,context);
  assert.equal((await provider.createPayment(input,config,process.env,context)).id,payment.id);return payment;
};
test('Square Sandbox payment, idempotency, retrieval and partial/full refund',{skip},async()=>{
  const payment=await create();assert.equal(payment.status,'COMPLETED');assert.equal((await provider.retrievePayment(payment.id,config,process.env)).id,payment.id);
  for(const amount of [40,60]){const refund=await provider.refundPayment({payment_id:payment.id,money:{amount,currency:'USD'}},config,process.env,{idempotencyKey:crypto.randomUUID()});assert.ok(['PENDING','COMPLETED'].includes(refund.status));assert.equal((await provider.retrieveRefund(refund.id,config,process.env)).payment_id,payment.id);}
});
test('Square Sandbox delayed capture and cancellation',{skip},async()=>{
  const authorized=await create(false);assert.equal(authorized.status,'APPROVED');assert.equal((await provider.completePayment(authorized.id,{version_token:authorized.version_token},config,process.env)).status,'COMPLETED');
  await provider.refundPayment({payment_id:authorized.id,money:{amount:100,currency:'USD'}},config,process.env,{idempotencyKey:crypto.randomUUID()});
  const canceled=await create(false);assert.equal((await provider.cancelPayment(canceled.id,config,process.env)).status,'CANCELED');
});
test('Square Sandbox decline has a safe error category',{skip},async()=>{await assert.rejects(()=>create(true,'cnon:card-nonce-declined'),error=>error.code==='card_declined');});
