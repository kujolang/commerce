import {assertStableId} from '../contracts.mjs';
import {canonicalJson} from '../revisions.mjs';

export const PAYMENT_STATES=Object.freeze(['created','pending','authorized','completed','failed','canceled']);
export const REFUND_STATES=Object.freeze(['requested','pending','completed','failed','rejected']);
export const PAYMENT_TRANSITIONS=Object.freeze({created:['pending','authorized','completed','failed','canceled'],pending:['authorized','completed','failed','canceled'],authorized:['completed','canceled','failed'],completed:[],failed:[],canceled:[]});
export const REFUND_TRANSITIONS=Object.freeze({requested:['pending','completed','failed','rejected'],pending:['completed','failed','rejected'],completed:[],failed:[],rejected:[]});
export const fail=(code,message=code)=>Object.assign(new Error(message),{code});
export function money(value){
  if(!Number.isSafeInteger(value?.amount)||value.amount<=0||!/^[A-Z]{3}$/.test(value?.currency||''))throw fail('invalid_money');
  return {amount:value.amount,currency:value.currency};
}
export function scopeOf(value){
  if(!['sandbox','production'].includes(value?.environment))throw fail('invalid_environment');
  return Object.freeze(Object.fromEntries(['merchant_id','connection_id','provider','environment','provider_merchant_id','location_id'].map(key=>[key,assertStableId(value[key],key)])));
}
export const scopeKey=value=>canonicalJson(scopeOf(value));
export function equalIntent(a,b){if(canonicalJson(a)!==canonicalJson(b))throw fail('intent_conflict');}
export function createOrder(input,{now=()=>new Date().toISOString()}={}){
  const scope=scopeOf(input.scope),id=assertStableId(input.id),customer_id=assertStableId(input.customer_id),offer_revision=assertStableId(input.offer_revision);
  if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>100)throw fail('invalid_lines');
  let total=0,currency;
  const lines=input.lines.map(line=>{
    const price=money(line.price),quantity=line.quantity;
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>999)throw fail('invalid_quantity');
    if(currency&&currency!==price.currency)throw fail('currency_mismatch');currency=price.currency;
    total+=price.amount*quantity;if(!Number.isSafeInteger(total))throw fail('amount_overflow');
    return {sku:assertStableId(line.sku),name:String(line.name||line.sku).slice(0,128),quantity,price};
  });
  const intent={customer_id,offer_revision,lines,total:{amount:total,currency}};
  // Callers provide already priced lines, including any explicit tax/shipping lines.
  // No browser amount, arbitrary metadata, or provider token is copied here.
  return {schema:'kujo-commerce-order/v1',schema_version:1,id,scope,intent,state:'open',version:1,active_payment_id:null,payments:{},refunds:{},operations:{},created_at:now(),updated_at:now()};
}
export function transitionOrder(order,state){
  const allowed={open:['canceled','fulfilled'],fulfilled:[],canceled:[]};
  if(!allowed[order.state]?.includes(state))throw fail('invalid_order_transition');
  if(state==='fulfilled'&&!Object.values(order.payments).some(payment=>payment.status==='completed'))throw fail('payment_not_completed');
  if(state==='canceled'&&Object.values(order.payments).some(payment=>['pending','authorized','completed'].includes(payment.status)))throw fail('payment_unresolved');
  return {...order,state};
}
export function assertObservation(scope,observation,expected){
  equalIntent(scopeOf(scope),scopeOf(observation.scope));
  money(observation.money);equalIntent(expected,observation.money);
  assertStableId(observation.provider_id,'provider_id');
  if(!['payment','refund'].includes(observation.kind)||!Number.isFinite(Date.parse(observation.updated_at)))throw fail('invalid_observation');
  if(observation.version_token!==undefined&&typeof observation.version_token!=='string')throw fail('invalid_version_token');
}
export function applyObservation(record,observation){
  const transitions=observation.kind==='payment'?PAYMENT_TRANSITIONS:REFUND_TRANSITIONS;
  if(!Object.hasOwn(transitions,observation.status))throw fail('unknown_provider_status');
  if(record.provider_id&&record.provider_id!==observation.provider_id)throw fail('provider_reference_conflict');
  const incoming=Date.parse(observation.updated_at),previous=record.observed_at?Date.parse(record.observed_at):-Infinity;
  if(incoming<previous)return false;
  if(record.status!==observation.status&&!transitions[record.status]?.includes(observation.status)){
    // A later conflicting terminal observation requires human reconciliation.
    if(incoming===previous)return false;
    throw fail('conflicting_provider_state');
  }
  const next={...record,status:observation.status,provider_id:observation.provider_id,observed_at:observation.updated_at};
  if(observation.version_token!==undefined)next.version_token=observation.version_token;
  if(observation.order_id)next.provider_order_id=assertStableId(observation.order_id);
  if(canonicalJson(next)===canonicalJson(record))return false;
  Object.assign(record,next);return true;
}
export function refundable(order,paymentId){
  const payment=order.payments[paymentId];if(payment?.status!=='completed')throw fail('payment_not_completed');
  return payment.money.amount-Object.values(order.refunds).filter(refund=>refund.payment_id===paymentId&&!['failed','rejected'].includes(refund.status)).reduce((sum,refund)=>sum+refund.money.amount,0);
}
export const operationKey=(type,id)=>JSON.stringify([type,assertStableId(id,'operation_id')]);
export function beginOperation(order,{id,type,intent}){
  const key=operationKey(type,id),found=order.operations[key];
  if(found){equalIntent(found.intent,intent);return found;}
  const operation={id,type,intent:structuredClone(intent),key:crypto.randomUUID(),correlation_id:crypto.randomUUID(),state:'ready',generation:0,attempts:0};
  order.operations[key]=operation;return operation;
}
export function claimOperation(operation,{now=Date.now(),leaseMs=30000,reconcile=false}={}){
  if(operation.state==='succeeded'||operation.state==='failed')return null;
  if(operation.state==='submitted'&&operation.lease_until>now)throw fail('operation_busy');
  if(operation.state!=='ready'&&!reconcile)throw fail('outcome_unknown');
  operation.state='submitted';operation.generation++;operation.attempts++;operation.token=crypto.randomUUID();operation.lease_until=now+leaseMs;
  return {token:operation.token,generation:operation.generation};
}
export function assertFence(operation,ticket){
  if(operation.state!=='submitted'||operation.token!==ticket?.token||operation.generation!==ticket?.generation)throw fail('stale_operation');
}
