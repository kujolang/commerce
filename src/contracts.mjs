export const CONTRACT_SCHEMAS = Object.freeze({
  checkoutSession:'kujo-commerce-checkout-session/v1', customerReference:'kujo-commerce-customer-reference/v1',
  paymentMethodConsent:'kujo-commerce-payment-method-consent/v1', subscription:'kujo-commerce-subscription/v1',
  payment:'kujo-commerce-payment/v1', refund:'kujo-commerce-refund/v1', dispute:'kujo-commerce-dispute/v1',
  offerRevision:'kujo-commerce-offer-revision/v1', providerReference:'kujo-commerce-provider-reference/v1',
  providerOperation:'kujo-commerce-provider-operation/v1', reconciliationResult:'kujo-commerce-reconciliation-result/v1',
  normalizedEvent:'kujo-commerce-event/v1', downstreamEvent:'kujo-commerce-downstream-event/v1',
  deliveryAttempt:'kujo-commerce-delivery-attempt/v1'
});

const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const requiredString=(value,name)=>{if(typeof value!=='string'||!value.trim())throw new Error(`${name} is required`);return value;};
export const assertStableId=(value,name='id')=>{requiredString(value,name);if(!ID.test(value))throw new Error(`${name} is not a stable identifier`);return value;};

export function createConsentEvidence(input,{now=()=>new Date()}={}){
  const evidence={schema:CONTRACT_SCHEMAS.paymentMethodConsent,schema_version:1,id:assertStableId(input.id,'consent id'),customer_reference:assertStableId(input.customer_reference,'customer reference'),checkout_reference:assertStableId(input.checkout_reference,'checkout reference'),offer_revision:assertStableId(input.offer_revision,'offer revision'),amount:Number(input.amount),currency:requiredString(input.currency,'currency').toUpperCase(),cadence:requiredString(input.cadence,'cadence'),purpose:requiredString(input.purpose,'purpose'),consent_text_version:requiredString(input.consent_text_version,'consent text version'),terms_version:requiredString(input.terms_version,'terms version'),occurred_at:(input.occurred_at||now().toISOString()),payment_method_storage_authorized:input.payment_method_storage_authorized===true,recurring_authorized:input.recurring_authorized===true};
  if(!Number.isSafeInteger(evidence.amount)||evidence.amount<0)throw new Error('consent amount must be a non-negative safe integer');
  if(!/^[A-Z]{3}$/.test(evidence.currency))throw new Error('consent currency must be an ISO currency code');
  if(!evidence.payment_method_storage_authorized||!evidence.recurring_authorized)throw new Error('explicit saved-payment and recurring authorization are required');
  if(input.network_evidence!==undefined)evidence.network_evidence=input.network_evidence;
  return Object.freeze(evidence);
}

export function providerReference(provider,type,id,environment){
  return Object.freeze({schema:CONTRACT_SCHEMAS.providerReference,schema_version:1,provider:assertStableId(provider,'provider'),type:assertStableId(type,'provider object type'),id:assertStableId(id,'provider object id'),environment:requiredString(environment,'environment')});
}

export function downstreamEvent(input){
  const value={schema:CONTRACT_SCHEMAS.downstreamEvent,schema_version:1,event_id:assertStableId(input.event_id,'event id'),aggregate_id:assertStableId(input.aggregate_id,'aggregate id'),aggregate_version:Number(input.aggregate_version),type:requiredString(input.type,'event type'),occurred_at:requiredString(input.occurred_at,'occurrence timestamp'),offer_revision:input.offer_revision||null,customer_reference:input.customer_reference||null,status:input.status||null,data:input.data&&typeof input.data==='object'?input.data:{}};
  if(!Number.isSafeInteger(value.aggregate_version)||value.aggregate_version<0)throw new Error('aggregate_version must be a non-negative safe integer');
  return value;
}
