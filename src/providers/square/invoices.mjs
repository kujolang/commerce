import {squareJson,requiredOperationKey,query} from './client.mjs';
import {money,fail} from '../../payments/model.mjs';
export const invoiceMethods={
  async createOrder({lines,reference_id,customer_id},config,env,context={}){return (await squareJson('/v2/orders',{idempotency_key:requiredOperationKey(context.idempotencyKey),order:{location_id:config.location_id,reference_id,customer_id,line_items:lines.map(line=>({name:line.name,quantity:String(line.quantity),base_price_money:money(line.price)}))}},config,env,context)).order;},
  async createInvoice({order_id,customer_id,payment_requests,title},config,env,context={}){
    if(!order_id||!customer_id||!payment_requests?.length)throw fail('invalid_invoice');
    if(payment_requests.some(request=>request.automatic_payment_source&&request.automatic_payment_source!=='NONE'))throw fail('automatic_invoice_charge_disabled');
    return (await squareJson('/v2/invoices',{idempotency_key:requiredOperationKey(context.idempotencyKey),invoice:{location_id:config.location_id,order_id,primary_recipient:{customer_id},title,delivery_method:'SHARE_MANUALLY',accepted_payment_methods:{card:true},payment_requests:payment_requests.map(request=>({...request,automatic_payment_source:'NONE',tipping_enabled:false})),store_payment_method_enabled:false}},config,env,context)).invoice;
  },
  async retrieveInvoice(id,config,env,context){return (await squareJson(`/v2/invoices/${encodeURIComponent(id)}`,undefined,config,env,context,'GET')).invoice;},
  async publishInvoice(id,{version},config,env,context={}){if(!Number.isSafeInteger(version)||version<0)throw fail('invoice_version_required');return (await squareJson(`/v2/invoices/${encodeURIComponent(id)}/publish`,{version,idempotency_key:requiredOperationKey(context.idempotencyKey)},config,env,context)).invoice;},
  async cancelInvoice(id,{version},config,env,context){if(!Number.isSafeInteger(version)||version<0)throw fail('invoice_version_required');return (await squareJson(`/v2/invoices/${encodeURIComponent(id)}/cancel`,{version},config,env,context)).invoice;},
  async listInvoices({cursor}={},config,env,context){return squareJson(`/v2/invoices${query({location_id:config.location_id,cursor,limit:100})}`,undefined,config,env,context,'GET');}
};
