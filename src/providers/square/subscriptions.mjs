import {equalIntent,money,fail} from '../../payments/model.mjs';
import {squareRequest,requiredOperationKey} from './client.mjs';

const subscriptionObject=value=>({id:String(value.id),status:String(value.status||'UNKNOWN').toLowerCase(),version:Number(value.version||0),customer_id:value.customer_id,plan_variation_id:value.plan_variation_id,card_id:value.card_id||null,created_at:value.created_at,updated_at:value.updated_at||value.created_at,canceled_date:value.canceled_date||null,charged_through_date:value.charged_through_date||null});

export const subscriptionMethods={
  verifySubscriptionPlan:async(id,expected,config,env,context={})=>{
    const response=await squareRequest(`/v2/catalog/object/${encodeURIComponent(id)}`,{},config,env,context),object=(await response.json()).object,data=object?.subscription_plan_variation_data,phase=data?.phases?.[0];
    if(object?.id!==id||object.is_deleted||object.type!=='SUBSCRIPTION_PLAN_VARIATION'||data.phases.length!==1||phase.cadence!=='MONTHLY'||phase.periods||data.can_prorate||data.monthly_billing_anchor_date||phase.pricing?.type!=='STATIC'||phase.pricing.discount_ids?.length)throw fail('unsupported_subscription_plan');
    equalIntent(money(phase.pricing.price_money),expected);return {id:object.id,version:object.version};
  },
  createSubscription:async(item,config,env,context={})=>{if(item.type!=='subscription'||!item.provider.plan_variation_id)throw new Error('trusted Square subscription mapping is required');if(!context.customerId)throw new Error('Square subscription requires a reconciled customer');if(!context.consent?.recurring_authorized)throw new Error('explicit recurring consent evidence is required');const body={idempotency_key:requiredOperationKey(context.idempotencyKey),location_id:config.location_id,plan_variation_id:item.provider.plan_variation_id,customer_id:context.customerId,card_id:context.cardId,start_date:context.startDate,source:{name:config.source_name||'Commerce Integration'}};const response=await squareRequest('/v2/subscriptions',{method:'POST',body:JSON.stringify(body)},config,env,context),value=await response.json();return{...subscriptionObject(value.subscription),provider_request_id:response.headers.get('x-request-id')||response.headers.get('x-square-request-id')||undefined};},
  retrieveSubscription:async(id,config,env,context={})=>{const response=await squareRequest(`/v2/subscriptions/${encodeURIComponent(id)}?include=actions`,{},config,env,context),value=await response.json();return{...subscriptionObject(value.subscription),actions:value.actions||[]};},
  cancelSubscription:async(id,config,env,context={})=>{const response=await squareRequest(`/v2/subscriptions/${encodeURIComponent(id)}/cancel`,{method:'POST',body:'{}'},config,env,context);return subscriptionObject((await response.json()).subscription);},
  pauseSubscription:async(id,input,config,env,context={})=>{const response=await squareRequest(`/v2/subscriptions/${encodeURIComponent(id)}/pause`,{method:'POST',body:JSON.stringify(input||{})},config,env,context);return subscriptionObject((await response.json()).subscription);},
  resumeSubscription:async(id,input,config,env,context={})=>{const response=await squareRequest(`/v2/subscriptions/${encodeURIComponent(id)}/resume`,{method:'POST',body:JSON.stringify(input||{})},config,env,context);return subscriptionObject((await response.json()).subscription);},
};
