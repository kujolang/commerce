import {scopedProviderConfig} from './model.mjs';
import {createCommandExecutor} from './commands.mjs';
import {fail,scopeOf,money,equalIntent} from './model.mjs';
import {assertStableId} from '../contracts.mjs';

export function createStorageConsent(input){
  if(input?.storage_authorized!==true||!input.text_version||!Number.isFinite(Date.parse(input.occurred_at)))throw fail('storage_consent_required');
  return {schema:'kujo-commerce-storage-consent/v1',schema_version:1,id:assertStableId(input.id),customer_reference:assertStableId(input.customer_reference),checkout_reference:assertStableId(input.checkout_reference),text_version:assertStableId(input.text_version),occurred_at:input.occurred_at,storage_authorized:true,recurring_authorized:input.recurring_authorized===true,...(input.recurring_authorized===true?{recurring:{money:money(input.recurring?.money),cadence:input.recurring?.cadence,plan_variation_id:assertStableId(input.recurring?.plan_variation_id),offer_revision:assertStableId(input.recurring?.offer_revision)}}:{})};
}
export function createLifecycleService({store,provider,scope:inputScope,config,env={},context={}}){
  const scope=scopeOf(inputScope);config=scopedProviderConfig(scope,config);const execute=createCommandExecutor({store,scope});
  const consentCheck=(order,consent)=>{if(consent.customer_reference!==order.intent.customer_id||consent.checkout_reference!==order.id)throw fail('consent_binding_mismatch');};
  return Object.freeze({
    async saveCard({orderId,operationId,customerId,sourceToken,consent:inputConsent}){
      const consent=createStorageConsent(inputConsent),intent={customer_id:assertStableId(customerId),consent};
      return execute({orderId,id:operationId,type:'card.create',intent,validate:order=>consentCheck(order,consent),mutate:operation=>provider.storePaymentMethod({source_id:sourceToken,customer_id:customerId,consent},config,env,{...context,idempotencyKey:operation.key}),project:card=>({id:card.id,customer_id:card.customer_id,brand:card.brand,last_4:card.last_4,exp_month:card.exp_month,exp_year:card.exp_year,enabled:card.enabled})});
    },
    async enroll({orderId,operationId,customerId,cardId,planVariationId,consent:inputConsent,startDate}){
      const consent=createStorageConsent(inputConsent);if(!consent.recurring_authorized)throw fail('recurring_consent_required');
      if(consent.recurring.cadence!=='MONTHLY'||consent.recurring.plan_variation_id!==planVariationId)throw fail('recurring_consent_mismatch');
      const intent={customer_id:assertStableId(customerId),card_id:assertStableId(cardId),plan_variation_id:assertStableId(planVariationId),consent,start_date:startDate||null};
      return execute({orderId,id:operationId,type:'subscription.create',intent,retrySafe:true,validate:order=>{if(order.state!=='open'||order.active_payment_id||order.collection_route&&order.collection_route!=='subscription'||order.collection_reference&&order.collection_reference!==operationId)throw fail('payment_unresolved');order.collection_route='subscription';order.collection_reference=operationId;consentCheck(order,consent);equalIntent(consent.recurring.money,order.intent.total);if(consent.recurring.offer_revision!==order.intent.offer_revision)throw fail('recurring_consent_mismatch');},mutate:async operation=>{
        const card=await provider.retrievePaymentMethod(cardId,config,env,context);if(card.customer_id!==customerId||card.enabled!==true)throw fail('saved_card_unavailable');
        await provider.verifySubscriptionPlan(planVariationId,consent.recurring.money,config,env,context);
        return provider.createSubscription({type:'subscription',provider:{plan_variation_id:planVariationId}},config,env,{...context,idempotencyKey:operation.key,customerId,cardId,startDate,consent:{recurring_authorized:true}});
      },project:value=>({id:value.id,status:value.status,version:value.version,customer_id:value.customer_id,plan_variation_id:value.plan_variation_id,card_id:value.card_id})});
    },
    async disableCard({orderId,operationId,customerId,cardId}){
      return execute({orderId,id:operationId,type:'card.disable',intent:{customer_id:customerId,card_id:cardId},retrySafe:true,mutate:async()=>{const card=await provider.retrievePaymentMethod(cardId,config,env,context);if(card.customer_id!==customerId)throw fail('customer_mismatch');if(card.enabled===false)return card;return provider.disablePaymentMethod(cardId,config,env,context);},project:card=>({id:card.id,customer_id:card.customer_id,enabled:card.enabled})});
    },
    async subscriptionAction({orderId,operationId,subscriptionId,customerId,action}){
      if(!['pause','resume','cancel'].includes(action))throw fail('unsupported_subscription_action');
      return execute({orderId,id:operationId,type:`subscription.${action}`,intent:{subscription_id:subscriptionId,customer_id:customerId,action},mutate:async()=>{
        const current=await provider.retrieveSubscription(subscriptionId,config,env,context);if(current.customer_id!==customerId)throw fail('customer_mismatch');
        if(action==='cancel'&&current.canceled_date)return current;
        if(current.actions?.length)throw fail('subscription_action_pending');
        return action==='cancel'?provider.cancelSubscription(subscriptionId,config,env,context):provider[`${action}Subscription`](subscriptionId,{},config,env,context);
      },project:value=>({id:value.id,status:value.status,version:value.version,customer_id:value.customer_id,canceled_date:value.canceled_date||null})});
    }
  });
}
