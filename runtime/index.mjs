import { providerFor } from '../src/providers.mjs';

const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const error=(message,status=400,headers={})=>json({error:message},status,headers);
const cors=(origin,config)=>origin&&(!config.allowed_origins?.length||config.allowed_origins.includes(origin))?{'access-control-allow-origin':origin,'vary':'origin'}:{};

export async function createCheckout(provider,items,config,env={},context={}){return providerFor(provider).createCheckout(items,config,env,context);}
export async function completeCheckout(provider,reference,config,env={},context={}){return providerFor(provider).completeCheckout(reference,config,env,context);}
export async function getCustomerPortal(provider,config,env={},context={}){return providerFor(provider).createCustomerPortal(config,env,context);}
export function normalizeEvent(provider,input){return providerFor(provider).normalizeWebhookEvent(input);}
export async function verifyStripe(raw,signature,secret,tolerance=300){return providerFor('stripe').verifyWebhook({raw,request:new Request('https://local.test',{headers:{'stripe-signature':signature}}),secret,tolerance});}
export async function verifyPolar(raw,headers,secret,tolerance=300){return providerFor('polar').verifyWebhook({raw,request:new Request('https://local.test',{headers}),secret,tolerance});}

function requestContext(config,context={}){return{...context,timeoutMs:config.runtime?.timeout_ms||config.timeout_ms||10000};}

export async function checkoutHandler(request,{catalog,config,env={},fetch:requestFetch,onDiagnostic}={}){
  const origin=request.headers.get('origin'),responseCors=cors(origin,config||{});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...responseCors,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type'}});
  if(request.method!=='POST')return error('Method not allowed',405,responseCors);
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return error('Content-Type must be application/json',415,responseCors);
  if(config.allowed_origins?.length&&origin&&!config.allowed_origins.includes(origin))return error('Origin not allowed',403);
  const contentLength=Number(request.headers.get('content-length')||0);if(contentLength>16384)return error('Request body too large',413,responseCors);
  const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>16384)return error('Request body too large',413,responseCors);
  let input;try{input=JSON.parse(raw);}catch{return error('Malformed JSON',400,responseCors);}
  if(!input||typeof input!=='object'||Array.isArray(input)||!Array.isArray(input.items)||!input.items.length||input.items.length>50)return error('items must be a non-empty array with at most 50 entries',400,responseCors);
  const attempt=input.checkout_attempt===undefined?'':String(input.checkout_attempt);if(attempt&&!/^[A-Za-z0-9_-]{1,128}$/.test(attempt))return error('Invalid checkout_attempt',400,responseCors);
  let adapter;try{adapter=providerFor(catalog.provider);}catch{return error('Configured provider is unavailable',503,responseCors);}
  if(input.items.length>1&&!adapter.capabilities.multi_item_checkout)return error(`${catalog.provider} supports one product per checkout`,400,responseCors);
  const trusted=[],seen=new Set();
  for(const item of input.items){
    if(!item||typeof item.sku!=='string'||!item.sku)return error('Each item requires a SKU',400,responseCors);
    if(seen.has(item.sku))return error(`Duplicate SKU in request: ${item.sku}`,400,responseCors);seen.add(item.sku);
    const product=catalog.products.find(value=>value.sku===item.sku),quantity=Number(item.quantity);
    if(!product)return error(`Unknown SKU: ${item.sku}`,400,responseCors);if(product.availability!=='available'||product.cart?.enabled===false)return error(`Unavailable SKU: ${item.sku}`,400,responseCors);
    if(!Number.isInteger(quantity)||quantity<(product.cart?.min||1)||quantity>(product.cart?.max||99))return error(`Invalid quantity for ${item.sku}`,400,responseCors);
    if(quantity!==1&&!adapter.capabilities.quantity)return error(`${catalog.provider} does not support quantity`,400,responseCors);
    trusted.push({...product,quantity,provider:product.provider});
  }
  const providerConfig={...(config.checkout||{}),...(config.providers?.[catalog.provider]||{})};
  try{return json(await adapter.createCheckout(trusted,providerConfig,env,requestContext(config,{checkoutAttempt:attempt,fetch:requestFetch})),200,responseCors);}
  catch(providerFailure){onDiagnostic?.({operation:'checkout',provider:catalog.provider,status:providerFailure.status||null,requestId:providerFailure.requestId||null,code:'provider_request_failed'});return error('Checkout could not be created',502,responseCors);}
}

export async function checkoutCompletionHandler(request,{provider,config,env={},fetch:requestFetch,onDiagnostic}={}){
  if(request.method!=='POST')return error('Method not allowed',405);if(!(request.headers.get('content-type')||'').startsWith('application/json'))return error('Content-Type must be application/json',415);
  const raw=await request.text();if(raw.length>4096)return error('Request body too large',413);let input;try{input=JSON.parse(raw);}catch{return error('Malformed JSON');}
  const reference=String(input.provider_reference||'');if(!reference)return error('provider_reference is required');
  try{return json(await providerFor(provider).completeCheckout(reference,config.providers?.[provider]||config,env,requestContext(config,{fetch:requestFetch,checkoutAttempt:String(input.checkout_attempt||'')})),200);}
  catch(failure){onDiagnostic?.({operation:'checkout_completion',provider,status:failure.status||null,requestId:failure.requestId||null,code:'provider_request_failed'});return error('Checkout could not be completed',502);}
}

export function createMemoryEventStore(){
  const processed=new Set(),inFlight=new Set();
  return Object.freeze({
    async hasProcessed(id){return processed.has(id);},
    async claim(id){if(processed.has(id)||inFlight.has(id))return false;inFlight.add(id);return true;},
    async markProcessed(id){inFlight.delete(id);processed.add(id);},
    async release(id){inFlight.delete(id);}
  });
}

export function createHttpEventSink({url,headers={},fetch:requestFetch=globalThis.fetch,timeoutMs=5000}={}){
  const target=new URL(url);if(target.protocol!=='https:')throw new Error('HTTP event sink requires HTTPS');
  return Object.freeze({async deliver(event){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await requestFetch(target,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(event),signal:controller.signal});if(!response.ok)throw new Error(`Event sink returned HTTP ${response.status}`);}finally{clearTimeout(timer);}}});
}

export async function deliverEvent(event,{store,sink,onDiagnostic}={}){
  if(!event.provider_event_id)throw new Error('Verified webhook is missing a provider event ID');
  let claimed=true;
  if(store?.claim)claimed=await store.claim(event.provider_event_id);else if(store?.hasProcessed)claimed=!(await store.hasProcessed(event.provider_event_id));
  if(!claimed)return{duplicate:true};
  try{if(sink?.enqueue)await sink.enqueue(event);else if(sink?.deliver)await sink.deliver(event);else if(typeof sink==='function')await sink(event);if(store?.markProcessed)await store.markProcessed(event.provider_event_id);return{duplicate:false};}
  catch(deliveryFailure){await store?.release?.(event.provider_event_id);onDiagnostic?.({operation:'webhook_delivery',provider:event.provider,eventId:event.provider_event_id,code:'delivery_failed'});throw deliveryFailure;}
}

export async function webhookHandler(request,{provider,secret,config={},env={},store,sink,executionContext,onDiagnostic,fetch:requestFetch,maxBodyBytes=1048576}={}){
  if(request.method!=='POST')return error('Method not allowed',405);
  let adapter;try{adapter=providerFor(provider);}catch{return error('Webhook provider is not configured',503);}
  if(!adapter.capabilities.webhooks)return error('Provider does not support webhooks',404);
  if(adapter.validateWebhookConfig({secret,config,env}).length)return error('Webhook endpoint is not configured',503);
  const contentLength=Number(request.headers.get('content-length')||0);if(contentLength>maxBodyBytes)return error('Request body too large',413);
  const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>maxBodyBytes)return error('Request body too large',413);
  let valid=false;try{valid=await adapter.verifyWebhook({raw,request,secret,config,env,context:requestContext(config,{fetch:requestFetch})});}catch{valid=false;}
  if(!valid)return error('Invalid webhook signature',401);
  let payload;try{payload=JSON.parse(raw);}catch{return error('Malformed webhook payload');}
  const normalized=adapter.normalizeWebhookEvent(payload);
  const delivery=deliverEvent(normalized,{store,sink,onDiagnostic});
  if(executionContext?.waitUntil){executionContext.waitUntil(delivery);return json({accepted:true,event:normalized},202);}
  try{const result=await delivery;return json({accepted:true,duplicate:result.duplicate,event:normalized},result.duplicate?200:202);}
  catch{return error('Verified event could not be delivered',503);}
}

export function createRuntimeHandlers(options){return Object.freeze({checkout:request=>checkoutHandler(request,options),webhook:request=>webhookHandler(request,options)});}
