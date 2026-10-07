import {readBytes} from '../src/payments/webhooks.mjs';
import {moneyDecimal} from '../src/money.mjs';
import {fail} from '../src/payments/model.mjs';

const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const publicOrder=order=>({id:order.id,state:order.state,invoice:order.invoice||null,money:order.intent.total,payments:Object.values(order.payments).map(payment=>({id:payment.id,status:payment.status,money:payment.money})),refunds:Object.values(order.refunds).map(refund=>({id:refund.id,payment_id:refund.payment_id,status:refund.status,money:refund.money}))});
export function createPaymentHandlers({service,authorize,resolveOrder,rateLimit,origin,applicationId,now=Date.now}={}){
  if(!service||typeof authorize!=='function'||typeof rateLimit!=='function'||!origin)throw fail('payment_http_configuration_required');
  const configuredOrigin=new URL(origin);if(service.scope.environment==='production'&&configuredOrigin.protocol!=='https:')throw fail('secure_origin_required');
  const allowedOrigin=configuredOrigin.origin;
  async function handle(request,action,work,{get=false,operator=false}={}){
    if(request.method!==(get?'GET':'POST'))return json({error:'method_not_allowed'},405);
    if(!get&&request.headers.get('origin')!==allowedOrigin)return json({error:'origin_rejected'},403);
    if(!get&&!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return json({error:'content_type_required'},415);
    try{
      const body=get?{order_id:new URL(request.url).searchParams.get('order_id')}:JSON.parse(new TextDecoder().decode(await readBytes(request)));
      if(!body||typeof body!=='object'||Array.isArray(body))throw fail('invalid_request');
      // Never send a transient source token to auth, pricing, audit or diagnostics.
      const principal=await authorize(request,{action,order_id:body.order_id});
      if(!principal?.id||principal.merchant_id!==service.scope.merchant_id)return json({error:'authentication_required'},401);
      if(operator&&!principal.permissions?.includes(action))return json({error:'permission_required'},403);
      if(!await rateLimit({action,principal,request}))return json({error:'rate_limited'},429);
      let order;if(body.order_id){order=await service.get(body.order_id);if(!order||(!operator&&order.intent.customer_id!==principal.customer_id))return json({error:'order_not_found'},404);}
      if(action==='payment.submit'&&Date.parse(order?.expires_at)<=now())return json({error:'session_expired'},409);
      return await work({body,principal,order});
    }catch(error){
      const codes=new Set(['outcome_unknown','operation_busy','payment_unresolved','intent_conflict','operation_failed','card_declined','source_required','invalid_request','refund_exceeds_available','payment_not_authorized','body_too_large']);
      const code=codes.has(error.code)?error.code:error instanceof SyntaxError?'invalid_request':'payment_unavailable';
      return json({error:code},code==='body_too_large'?413:code==='invalid_request'||code==='source_required'?400:code==='payment_unavailable'?503:409);
    }
  }
  return Object.freeze({
    session:request=>handle(request,'checkout.create',async({body,principal})=>{
      if(typeof resolveOrder!=='function'||!applicationId)return json({error:'checkout_not_configured'},503);
      const trusted=await resolveOrder({principal,items:body.items,order_id:body.order_id});
      if(trusted?.customer_id!==principal.customer_id)throw fail('invalid_request');
      const order=await service.create(trusted);
      return json({session_id:order.id,expires_at:order.expires_at,amount:moneyDecimal(order.intent.total),currency:order.intent.total.currency,application_id:applicationId,location_id:service.scope.location_id,environment:service.scope.environment,status:publicOrder(order)},201);
    }),
    pay:request=>handle(request,'payment.submit',async({body,order})=>{
      if(!order)throw fail('invalid_request');
      const result=await service.pay({orderId:order.id,attemptId:order.checkout_attempt_id,sourceToken:body.source_token,mode:body.mode==='hosted'?'hosted':'embedded'});
      return json(result,201);
    }),
    restart:request=>handle(request,'checkout.restart',async({order})=>{if(!order)throw fail('invalid_request');return json(await service.restartCheckout(order.id));}),
    status:request=>handle(request,'payment.read',async({order})=>order?json(publicOrder(order)):json({error:'order_not_found'},404),{get:true}),
    refund:request=>handle(request,'payment.refund',async({body,order})=>{if(!order)throw fail('invalid_request');return json(await service.refund({orderId:order.id,paymentId:body.payment_id,refundId:body.operation_id,amount:body.amount,reason:body.reason}),201);},{operator:true}),
    capture:request=>handle(request,'payment.capture',async({body,order})=>{if(!order)throw fail('invalid_request');return json(await service.changePayment({orderId:order.id,paymentId:body.payment_id,action:'capture',operationId:body.operation_id}));},{operator:true}),
    cancel:request=>handle(request,'payment.cancel',async({body,order})=>{if(!order)throw fail('invalid_request');return json(await service.changePayment({orderId:order.id,paymentId:body.payment_id,action:'cancel',operationId:body.operation_id}));},{operator:true}),
    reconcile:request=>handle(request,'payment.reconcile',async({body,order})=>{if(!order)throw fail('invalid_request');return json(await service.reconcile({orderId:order.id,attemptId:body.operation_id,type:body.operation_type}));},{operator:true})
  });
}
