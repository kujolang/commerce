import {verifySquareSignature} from '../providers/square/events.mjs';
import {fail,scopeOf,scopedProviderConfig} from './model.mjs';

export async function readBytes(request,maxBytes=16384){
  if(Number(request.headers.get('content-length'))>maxBytes)throw fail('body_too_large');
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw fail('body_too_large');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
export function createSquarePaymentWebhook({store,scope:inputScope,secret,notificationUrl,maxBytes=262144}={}){
  const scope=scopeOf(inputScope);
  return async request=>{
    if(request.method!=='POST')return new Response(null,{status:405});
    if(!secret||!notificationUrl)return new Response(null,{status:503});
    try{
      const raw=await readBytes(request,maxBytes);
      if(!await verifySquareSignature({raw,signature:request.headers.get('x-square-hmacsha256-signature'),secret,notificationUrl}))return new Response(null,{status:401});
      const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
      if(input.merchant_id!==scope.provider_merchant_id)return new Response(null,{status:403});
      const kind=input.type?.startsWith('payment.')?'payment':input.type?.startsWith('refund.')?'refund':null;
      // Explicit allowlist: unsupported events cannot trigger a financial effect.
      if(!['payment.created','payment.updated','refund.created','refund.updated'].includes(input.type))return new Response(null,{status:204});
      const object=input.data?.object?.[kind],id=input.data?.id||object?.id;
      if(!input.event_id||!id||String(input.event_id).length>255||String(id).length>255)return new Response(null,{status:400});
      if(object?.location_id&&object.location_id!==scope.location_id)return new Response(null,{status:403});
      const result=await store.ingest(scope,{id:input.event_id,type:input.type,kind,provider_id:id});
      return Response.json({accepted:true,duplicate:result.duplicate},{status:result.duplicate?200:202});
    }catch(error){return new Response(null,{status:error.code==='body_too_large'?413:error instanceof SyntaxError||error instanceof TypeError?400:503});}
  };
}
export async function processPaymentWebhook({store,service,provider,config,env={},context={},maxAttempts=5,delayMs=1000}){
  const scope=service.scope;config=scopedProviderConfig(scope,config);const receipt=await store.lease(scope);if(!receipt)return null;
  try{
    const {kind,provider_id}=receipt.event;
    const remote=kind==='payment'?await provider.retrievePayment(provider_id,config,env,context):await provider.retrieveRefund(provider_id,config,env,context);
    const observation=kind==='payment'?provider.paymentObservation(remote,scope):provider.refundObservation(remote,scope);
    let reference_id=remote.reference_id;
    if(kind==='payment'&&!reference_id&&remote.order_id){const order=await provider.retrieveOrder(remote.order_id,config,env,context);if(order.location_id!==scope.location_id)throw fail('provider_observation_mismatch');reference_id=order.reference_id;}
    const local=await store.locate(scope,{kind,provider_id,reference_id,provider_order_id:remote.order_id});
    if(!local)throw fail('unmapped_provider_observation');
    await service.observe({orderId:local.order_id,localId:local.local_id,observation,receipt});
    return {status:'processed',event_id:receipt.id};
  }catch(error){if(error.code==='stale_receipt')return {status:'superseded',event_id:receipt.id};await store.retry(scope,receipt,{maxAttempts,delayMs});return {status:receipt.attempts>=maxAttempts?'dead':'retrying',event_id:receipt.id,code:error.code||'observation_unavailable'};}
}
