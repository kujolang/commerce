import {squareRequest,requiredOperationKey} from './client.mjs';

export const customerMethods={
  findCustomer:async({email,reference_id},config,env,context={})=>{if(!email&&!reference_id)throw new Error('Square customer lookup requires email or reference_id');const filter=reference_id?{reference_id:{exact:reference_id}}:{email_address:{exact:email}};const response=await squareRequest('/v2/customers/search',{method:'POST',body:JSON.stringify({limit:3,query:{filter}})},config,env,context),customers=(await response.json()).customers||[];if(customers.length>1)throw Object.assign(new Error('Square customer lookup is ambiguous'),{code:'ambiguous_customer',terminal:true});return customers[0]||null;},
  createCustomer:async(customer,config,env,context={})=>{const body={idempotency_key:requiredOperationKey(context.idempotencyKey),email_address:customer.email_address,given_name:customer.given_name,family_name:customer.family_name,reference_id:customer.reference_id};const response=await squareRequest('/v2/customers',{method:'POST',body:JSON.stringify(body)},config,env,context);return(await response.json()).customer;},
  createSavedPaymentMethod:async({source_id,verification_token,customer_id,cardholder_name,billing_address,consent},config,env,context={})=>{if(!source_id||!customer_id)throw new Error('Square saved card requires a single-use source and customer');if(!consent?.payment_method_storage_authorized||!consent?.recurring_authorized)throw new Error('explicit saved-payment and recurring consent evidence is required');const body={idempotency_key:requiredOperationKey(context.idempotencyKey),source_id,verification_token,card:{customer_id,cardholder_name,billing_address}};const response=await squareRequest('/v2/cards',{method:'POST',body:JSON.stringify(body)},config,env,context);const card=(await response.json()).card;return{id:card.id,customer_id:card.customer_id,brand:card.card_brand,last_4:card.last_4,exp_month:card.exp_month,exp_year:card.exp_year,provider_request_id:response.headers.get('x-request-id')||undefined};},
};

import {squareJson,query} from './client.mjs';
const cardSummary=card=>({id:card.id,customer_id:card.customer_id,brand:card.card_brand,last_4:card.last_4,exp_month:card.exp_month,exp_year:card.exp_year,enabled:card.enabled});
export const cardMethods={
  async storePaymentMethod({source_id,customer_id,consent},config,env,context={}){
    if(!source_id||!customer_id||consent?.storage_authorized!==true)throw new Error('Explicit payment method storage consent is required');
    const value=await squareJson('/v2/cards',{idempotency_key:requiredOperationKey(context.idempotencyKey),source_id,card:{customer_id}},config,env,context);return cardSummary(value.card);
  },
  async retrievePaymentMethod(id,config,env,context){return cardSummary((await squareJson(`/v2/cards/${encodeURIComponent(id)}`,undefined,config,env,context,'GET')).card);},
  async listPaymentMethods({customer_id,cursor},config,env,context){if(!customer_id)throw new Error('Customer required');const value=await squareJson(`/v2/cards${query({customer_id,cursor,include_disabled:true})}`,undefined,config,env,context,'GET');return {cards:(value.cards||[]).map(cardSummary),cursor:value.cursor||null};},
  async disablePaymentMethod(id,config,env,context){return cardSummary((await squareJson(`/v2/cards/${encodeURIComponent(id)}/disable`,{},config,env,context)).card);}
};
