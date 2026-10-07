import {providerFinancials} from '../../payments/fees.mjs';
import {squareJson,requiredOperationKey,query} from './client.mjs';
import {money,fail,scopeOf} from '../../payments/model.mjs';
const paymentStates={PENDING:'pending',APPROVED:'authorized',COMPLETED:'completed',FAILED:'failed',CANCELED:'canceled'};
const refundStates={PENDING:'pending',COMPLETED:'completed',FAILED:'failed',REJECTED:'rejected'};
function observation(value,scope,kind){
  const status=(kind==='payment'?paymentStates:refundStates)[value.status];
  if(!status||value.location_id!==scope.location_id)throw fail('provider_observation_mismatch');
  const result={schema:'kujo-commerce-provider-observation/v1',schema_version:1,scope:scopeOf(scope),kind,provider_id:value.id,status,money:money(value.amount_money),updated_at:value.updated_at||value.created_at};
  result.financials=providerFinancials(value);
  if(value.version_token!==undefined)result.version_token=value.version_token;
  if(value.order_id)result.order_id=value.order_id;
  if(kind==='refund')result.payment_id=value.payment_id;
  return result;
}
export const paymentMethods={
  async createPayment(input,config,env,context={}){
    if(typeof input.source_id!=='string'||!input.source_id||['CASH','EXTERNAL'].includes(input.source_id))throw fail('invalid_payment_source');
    if(!/^[A-Za-z0-9_-]{1,40}$/.test(input.reference_id||''))throw fail('invalid_payment_reference');
    const body={idempotency_key:requiredOperationKey(context.idempotencyKey),source_id:input.source_id,amount_money:money(input.money),location_id:config.location_id,reference_id:input.reference_id,autocomplete:input.autocomplete!==false};
    if(input.customer_id)body.customer_id=input.customer_id;
    if(input.order_id)body.order_id=input.order_id;
    if(input.fee){if(config.fee_policy?.enabled!==true||input.fee.policy_id!==config.fee_policy.id)throw fail('fee_policy_not_authorized');body.app_fee_money=input.fee.amount_money;body.app_fee_allocations=input.fee.allocations;}
    // Raw card fields are never accepted by this primitive.
    return (await squareJson('/v2/payments',body,config,env,context)).payment;
  },
  async retrievePayment(id,config,env,context){return (await squareJson(`/v2/payments/${encodeURIComponent(id)}`,undefined,config,env,context,'GET')).payment;},
  async completePayment(id,{version_token}={},config,env,context){if(!version_token)throw fail('payment_version_required');return (await squareJson(`/v2/payments/${encodeURIComponent(id)}/complete`,{version_token},config,env,context)).payment;},
  async cancelPayment(id,config,env,context){return (await squareJson(`/v2/payments/${encodeURIComponent(id)}/cancel`,{},config,env,context)).payment;},
  async listPayments(input,config,env,context){return squareJson(`/v2/payments${query({begin_time:input.begin_time,end_time:input.end_time,cursor:input.cursor,location_id:config.location_id,limit:100,sort_order:'ASC'})}`,undefined,config,env,context,'GET');},
  async findPayment(input,config,env,context={}){
    if(!input.reference_id&&!input.order_id)throw fail('correlation_required');
    let cursor,found=[];
    for(let page=0;page<(context.maxPages||10);page++){
      const value=await paymentMethods.listPayments({begin_time:input.begin_time,cursor},config,env,context);
      found.push(...(value.payments||[]).filter(payment=>payment.location_id===config.location_id&&(input.order_id?payment.order_id===input.order_id:payment.reference_id===input.reference_id)));
      if(found.length>1)throw fail('ambiguous_payment');
      if(!value.cursor)return found[0]||null;
      if(value.cursor===cursor)throw fail('reconciliation_incomplete');cursor=value.cursor;
    }
    throw fail('reconciliation_incomplete');
  },
  paymentObservation:(value,scope)=>observation(value,scope,'payment'),
  async refundPayment(input,config,env,context={}){
    if(!input.payment_id)throw fail('payment_reference_required');
    const body={idempotency_key:requiredOperationKey(context.idempotencyKey),payment_id:input.payment_id,amount_money:money(input.money),reason:input.reason||undefined,payment_version_token:input.payment_version_token||undefined};
    return (await squareJson('/v2/refunds',body,config,env,context)).refund;
  },
  async retrieveRefund(id,config,env,context){return (await squareJson(`/v2/refunds/${encodeURIComponent(id)}`,undefined,config,env,context,'GET')).refund;},
  async listRefunds(input,config,env,context){return squareJson(`/v2/refunds${query({begin_time:input.begin_time,end_time:input.end_time,cursor:input.cursor,location_id:config.location_id,limit:100})}`,undefined,config,env,context,'GET');},
  // Refunds do not expose a recoverable caller correlation ID. Matching amount
  // or reason alone cannot prove an uncertain refund is ours. Operator evidence
  // must bind a recovered provider ID before retrieval can resolve it.
  async findRefund(){return null;},
  refundObservation:(value,scope)=>observation(value,scope,'refund')
};
