import { capabilities } from '../src/providers.mjs';

const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}});
const error=(message,status=400)=>json({error:message},status);
const timingSafeEqual=(a,b)=>{if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0};
const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const form=entries=>{const p=new URLSearchParams();for(const [k,v] of entries)p.append(k,String(v));return p};

const safeUrl=value=>{try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw Error();return url.toString()}catch{throw Error('Provider returned an unsafe checkout URL')}};
const addIf=(entries,key,value)=>{if(value!==undefined&&value!==null&&value!=='')entries.push([key,value])};

export async function createCheckout(provider,items,config,env={},context={}) {
  if(!capabilities[provider])throw Error('Unknown provider');
  if(provider==='mock') {const base=config.checkout_url||config.success_url;return {checkout_url:safeUrl(`${base}${base.includes('?')?'&':'?'}provider=mock&items=${encodeURIComponent(items.map(i=>`${i.sku}:${i.quantity}`).join(','))}`)}}
  if(provider==='link') { if(items.length!==1||items[0].quantity!==1)throw Error('Link supports one product with quantity one per checkout');return {checkout_url:safeUrl(items[0].provider.url)}; }
  if(provider==='polar') {
    if(items.length!==1||items[0].quantity!==1)throw Error('Polar supports one product with quantity one per checkout');
    const token=env[config.access_token_env||'POLAR_ACCESS_TOKEN'];if(!token)throw Error('Polar access token is not configured');
    const body={products:[items[0].provider.product_id],success_url:config.success_url,metadata:{skus:[items[0].sku],checkout_attempt:context.checkoutAttempt||undefined}};
    if(config.allow_discount_codes!==undefined)body.allow_discount_codes=!!config.allow_discount_codes;
    if(config.require_billing_address!==undefined)body.require_billing_address=!!config.require_billing_address;
    if(context.customerEmail)body.customer_email=context.customerEmail;
    const r=await fetch(`${config.api_base||'https://api.polar.sh/v1'}/checkouts/`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Polar checkout request failed');const v=await r.json();return{checkout_url:safeUrl(v.url)};
  }
  const key=env[config.secret_key_env||'STRIPE_SECRET_KEY'];
  if(!key&&items.length===1&&items[0].provider.url)return{checkout_url:safeUrl(items[0].provider.url)};
  if(!key)throw Error('Stripe secret key is not configured');
  const mode=items.some(i=>i.type==='subscription')?'subscription':'payment';
  const entries=[['mode',mode],['success_url',config.success_url],['cancel_url',config.cancel_url]];
  addIf(entries,'automatic_tax[enabled]',config.automatic_tax===undefined?undefined:!!config.automatic_tax);
  addIf(entries,'allow_promotion_codes',config.promotion_codes===undefined?undefined:!!config.promotion_codes);
  addIf(entries,'billing_address_collection',config.billing_address_collection);
  addIf(entries,'phone_number_collection[enabled]',config.phone_collection===undefined?undefined:!!config.phone_collection);
  if(mode==='payment')addIf(entries,'customer_creation',config.customer_creation);
  addIf(entries,'client_reference_id',context.checkoutAttempt);
  addIf(entries,'metadata[checkout_attempt]',context.checkoutAttempt);
  (config.allowed_shipping_countries||[]).forEach((country,n)=>entries.push([`shipping_address_collection[allowed_countries][${n}]`,country]));
  (config.shipping_rate_ids||[]).forEach((rate,n)=>entries.push([`shipping_options[${n}][shipping_rate]`,rate]));
  (config.custom_fields||[]).forEach((field,n)=>{addIf(entries,`custom_fields[${n}][key]`,field.key);addIf(entries,`custom_fields[${n}][label][type]`,'custom');addIf(entries,`custom_fields[${n}][label][custom]`,field.label);addIf(entries,`custom_fields[${n}][type]`,field.type||'text');addIf(entries,`custom_fields[${n}][optional]`,!!field.optional)});
  items.forEach((i,n)=>{entries.push([`line_items[${n}][price]`,i.provider.price_id],[`line_items[${n}][quantity]`,i.quantity],[`metadata[sku_${n}]`,i.sku])});
  const headers={authorization:`Basic ${btoa(`${key}:`)}`,'content-type':'application/x-www-form-urlencoded'};if(context.checkoutAttempt)headers['idempotency-key']=`kujo-${context.checkoutAttempt}`;
  const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers,body:form(entries)});if(!r.ok)throw Error('Stripe checkout request failed');const v=await r.json();return{checkout_url:safeUrl(v.url)};
}

export async function checkoutHandler(request,{catalog,config,env={}}) {
  if(request.method!=='POST')return error('Method not allowed',405);
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return error('Content-Type must be application/json',415);
  const origin=request.headers.get('origin');if(config.allowed_origins?.length&&origin&&!config.allowed_origins.includes(origin))return error('Origin not allowed',403);
  const raw=await request.text();if(raw.length>16384)return error('Request body too large',413);
  let input;try{input=JSON.parse(raw)}catch{return error('Malformed JSON')};if(!Array.isArray(input.items)||!input.items.length||input.items.length>50)return error('items must be a non-empty array with at most 50 entries');
  const attempt=input.checkout_attempt===undefined?'':String(input.checkout_attempt);if(attempt&&!/^[A-Za-z0-9_-]{1,128}$/.test(attempt))return error('Invalid checkout_attempt');
  const providerCaps=capabilities[catalog.provider];if(!providerCaps)return error('Configured provider is unavailable',503);if(input.items.length>1&&!providerCaps.multi_item_checkout)return error(`${catalog.provider} supports one product per checkout`);
  const trusted=[],seen=new Set();for(const item of input.items){if(!item||typeof item.sku!=='string')return error('Each item requires a SKU');if(seen.has(item.sku))return error(`Duplicate SKU in request: ${item.sku}`);seen.add(item.sku);const p=catalog.products.find(x=>x.sku===item.sku);const q=Number(item.quantity);if(!p)return error(`Unknown SKU: ${item.sku}`);if(p.availability!=='available')return error(`Unavailable SKU: ${item.sku}`);if(!Number.isInteger(q)||q<(p.cart?.min||1)||q>(p.cart?.max||99))return error(`Invalid quantity for ${item.sku}`);if(q!==1&&!providerCaps.quantity)return error(`${catalog.provider} does not support quantity`);trusted.push({...p,quantity:q,provider:p.provider})}
  const providerConfig={...(config.checkout||{}),...(config.providers?.[catalog.provider]||{})};
  try{return json(await createCheckout(catalog.provider,trusted,providerConfig,env,{checkoutAttempt:attempt}),200,origin?{'access-control-allow-origin':origin}:{})}catch{return error('Checkout could not be created',502)}
}

export async function getCustomerPortal(provider,config,env={},context={}) {
  if(provider==='mock')return{portal_url:safeUrl(config.portal_url||'https://example.com/account/?mock=portal')};
  if(provider==='link')return null;
  if(config.portal_url)return{portal_url:safeUrl(config.portal_url)};
  if(provider==='polar') {
    if(!context.customerId)throw Error('Polar customer portal session requires a customer ID');
    const token=env[config.access_token_env||'POLAR_ACCESS_TOKEN'];if(!token)throw Error('Polar access token is not configured');
    const response=await fetch(`${config.api_base||'https://api.polar.sh/v1'}/customer-sessions/`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({customer_id:context.customerId})});if(!response.ok)throw Error('Polar customer portal request failed');const value=await response.json();return{portal_url:safeUrl(value.customer_portal_url)};
  }
  if(provider==='stripe') {
    if(!context.customerId)throw Error('Stripe customer portal session requires a customer ID');
    const key=env[config.secret_key_env||'STRIPE_SECRET_KEY'];if(!key)throw Error('Stripe secret key is not configured');const entries=[['customer',context.customerId]];addIf(entries,'return_url',config.return_url);const response=await fetch('https://api.stripe.com/v1/billing_portal/sessions',{method:'POST',headers:{authorization:`Basic ${btoa(`${key}:`)}`,'content-type':'application/x-www-form-urlencoded'},body:form(entries)});if(!response.ok)throw Error('Stripe customer portal request failed');const value=await response.json();return{portal_url:safeUrl(value.url)};
  }
  throw Error('Unknown provider');
}

export async function verifyStripe(raw,signature,secret,tolerance=300) {const values=signature.split(',').map(value=>value.split('=')).filter(value=>value.length===2),timestamp=values.find(([key])=>key==='t')?.[1],signatures=values.filter(([key])=>key==='v1').map(([,value])=>value);if(!timestamp||!signatures.length||!Number.isFinite(Number(timestamp)))return false;if(Math.abs(Date.now()/1000-Number(timestamp))>tolerance)return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const expected=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`)));return signatures.some(value=>timingSafeEqual(expected,value))}
export async function verifyPolar(raw,headers,secret,tolerance=300) {const id=headers.get('webhook-id'),ts=headers.get('webhook-timestamp'),signatures=(headers.get('webhook-signature')||'').split(' ').map(value=>value.replace(/^v1,/,'')).filter(Boolean);if(!id||!ts||!signatures.length||!Number.isFinite(Number(ts))||Math.abs(Date.now()/1000-Number(ts))>tolerance)return false;const key=secret.startsWith('whsec_')?Uint8Array.from(atob(secret.slice(6)),c=>c.charCodeAt(0)):new TextEncoder().encode(secret);const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);const expected=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(`${id}.${ts}.${raw}`)))));return signatures.some(value=>timingSafeEqual(expected,value))}
export function normalizeEvent(provider,event){const map={stripe:{'checkout.session.completed':'commerce.checkout.completed','customer.subscription.created':'commerce.subscription.created','customer.subscription.updated':'commerce.subscription.updated','customer.subscription.deleted':'commerce.subscription.cancelled','charge.refunded':'commerce.refund.created','customer.updated':'commerce.customer.updated'},polar:{'checkout.updated':'commerce.checkout.completed','order.created':'commerce.order.created','subscription.created':'commerce.subscription.created','subscription.updated':'commerce.subscription.updated','subscription.canceled':'commerce.subscription.cancelled','subscription.revoked':'commerce.subscription.cancelled','refund.created':'commerce.refund.created','customer.updated':'commerce.customer.updated'}};const object=event.data?.object||event.data||{},metadata=object.metadata||{},skus=Array.isArray(metadata.skus)?metadata.skus:Object.keys(metadata).filter(key=>key.startsWith('sku_')).sort().map(key=>metadata[key]).filter(Boolean);const created=typeof event.created==='number'?event.created*1000:(Date.parse(event.created_at||event.timestamp||'')||Date.now());return{schema:'kujo-commerce-event/v1',provider,type:map[provider]?.[event.type]||'commerce.unknown',provider_event_id:event.id||'',provider_object_id:object.id||'',skus,timestamp:new Date(created).toISOString()}}
export async function webhookHandler(request,{provider,secret}){if(request.method!=='POST')return error('Method not allowed',405);const raw=await request.text();let valid=false;if(provider==='stripe')valid=await verifyStripe(raw,request.headers.get('stripe-signature')||'',secret);if(provider==='polar')valid=await verifyPolar(raw,request.headers,secret);if(provider==='mock')valid=request.headers.get('x-kujo-mock-signature')===secret;if(!valid)return error('Invalid webhook signature',401);try{return json(normalizeEvent(provider,JSON.parse(raw)))}catch{return error('Malformed webhook payload')}}
