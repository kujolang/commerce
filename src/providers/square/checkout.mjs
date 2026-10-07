import {squareRequest,requiredOperationKey} from './client.mjs';
import {checkoutResult} from '../../provider-utils.mjs';

export const checkoutMethods={
  createCheckout:async(items,config,env,context={})=>{if(items.some(item=>item.type==='subscription'))throw new Error('Square subscriptions use createSubscription, not Payment Links');const body={idempotency_key:context.idempotencyKey!==undefined?requiredOperationKey(context.idempotencyKey):context.checkoutAttempt!==undefined?requiredOperationKey(context.checkoutAttempt):crypto.randomUUID(),order:{location_id:config.location_id,line_items:items.map(item=>({catalog_object_id:item.provider.catalog_object_id,quantity:String(item.quantity)}))},checkout_options:{redirect_url:config.success_url,ask_for_shipping_address:Boolean(config.ask_for_shipping_address),enable_coupon:config.promotion_codes!==false}};const response=await squareRequest('/v2/online-checkout/payment-links',{method:'POST',body:JSON.stringify(body)},config,env,context);const value=await response.json();return checkoutResult(value.payment_link?.url,{provider_reference:value.payment_link?.id,provider_request_id:response.headers.get('x-request-id')||response.headers.get('x-square-request-id')||undefined});},
};

import {squareJson} from './client.mjs';
import {money,fail} from '../../payments/model.mjs';
export const ownedCheckoutMethods={
  async retrieveOrder(id,config,env,context){return (await squareJson(`/v2/orders/${encodeURIComponent(id)}`,undefined,config,env,context,'GET')).order;},
  async findOwnedCheckout({reference_id},config,env,context={}){
    let cursor,match,examined=0;
    for(let page=0;page<(context.maxPages||10);page++){
      const batch=await ownedCheckoutMethods.listPaymentLinks({cursor},config,env,context);
      for(const link of batch.payment_links||[]){
        if(++examined>Math.min(context.maxObjects||100,100))throw fail('reconciliation_incomplete');
        const order=await ownedCheckoutMethods.retrieveOrder(link.order_id,config,env,context);
        if(order.location_id===config.location_id&&order.reference_id===reference_id){
          if(match)throw fail('ambiguous_checkout');
          match={...checkoutResult(link.url),provider_reference:link.id,provider_order_id:link.order_id,money:money(order.total_money)};
        }
      }
      if(!batch.cursor)return match||null;
      if(cursor===batch.cursor)throw fail('reconciliation_incomplete');cursor=batch.cursor;
    }
    throw fail('reconciliation_incomplete');
  },
  async createOwnedCheckout({lines,reference_id},config,env,context={}){
    const response=await squareJson('/v2/online-checkout/payment-links',{
      idempotency_key:requiredOperationKey(context.idempotencyKey),
      order:{location_id:config.location_id,reference_id,line_items:lines.map(line=>({name:line.name,quantity:String(line.quantity),base_price_money:money(line.price)}))},
      checkout_options:{redirect_url:config.success_url,allow_tipping:false,enable_coupon:false}
    },config,env,context);
    const link=response.payment_link,order=response.related_resources?.orders?.find(value=>value.id===link?.order_id);
    if(!link?.id||!link?.order_id||!order?.total_money)throw fail('checkout_correlation_missing');
    return {...checkoutResult(link.url),provider_reference:link.id,provider_order_id:link.order_id,money:money(order.total_money)};
  },
  async retrievePaymentLink(id,config,env,context){return (await squareJson(`/v2/online-checkout/payment-links/${encodeURIComponent(id)}`,undefined,config,env,context,'GET')).payment_link;},
  async listPaymentLinks({cursor}={},config,env,context){return squareJson(`/v2/online-checkout/payment-links${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,undefined,config,env,context,'GET');},
  async deletePaymentLink(id,config,env,context){return squareJson(`/v2/online-checkout/payment-links/${encodeURIComponent(id)}`,undefined,config,env,context,'DELETE');}
};
