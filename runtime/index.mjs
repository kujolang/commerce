import { capabilities } from '../src/providers.mjs';

const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}});
const error=(message,status=400)=>json({error:message},status);
const timingSafeEqual=(a,b)=>{if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0};
const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const form=entries=>{const p=new URLSearchParams();for(const [k,v] of entries)p.append(k,String(v));return p};

export async function createCheckout(provider,items,config,env={}) {
  if(!capabilities[provider])throw Error('Unknown provider');
  if(provider==='mock') return {checkout_url:`${config.success_url}?provider=mock&items=${encodeURIComponent(items.map(i=>`${i.sku}:${i.quantity}`).join(','))}`};
  if(provider==='link') { if(items.length!==1)throw Error('Link supports one product per checkout');return {checkout_url:items[0].provider.url}; }
  if(provider==='polar') {
    if(items.length!==1||items[0].quantity!==1)throw Error('Polar supports one product with quantity one per checkout');
    const token=env[config.access_token_env||'POLAR_ACCESS_TOKEN'];if(!token)throw Error('Polar access token is not configured');
    const r=await fetch(`${config.api_base||'https://api.polar.sh/v1'}/checkouts/`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({products:[items[0].provider.product_id],success_url:config.success_url,metadata:{skus:[items[0].sku]}})});if(!r.ok)throw Error('Polar checkout request failed');const v=await r.json();return{checkout_url:v.url};
  }
  const key=env[config.secret_key_env||'STRIPE_SECRET_KEY'];if(!key)throw Error('Stripe secret key is not configured');
  const entries=[['mode',items.some(i=>i.type==='subscription')?'subscription':'payment'],['success_url',config.success_url],['cancel_url',config.cancel_url],['automatic_tax[enabled]',!!config.automatic_tax],['allow_promotion_codes',!!config.promotion_codes]];
  items.forEach((i,n)=>{entries.push([`line_items[${n}][price]`,i.provider.price_id],[`line_items[${n}][quantity]`,i.quantity],[`metadata[sku_${n}]`,i.sku])});
  const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:`Basic ${btoa(`${key}:`)}`,'content-type':'application/x-www-form-urlencoded'},body:form(entries)});if(!r.ok)throw Error('Stripe checkout request failed');const v=await r.json();return{checkout_url:v.url};
}

export async function checkoutHandler(request,{catalog,config,env={}}) {
  if(request.method!=='POST')return error('Method not allowed',405);
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return error('Content-Type must be application/json',415);
  const origin=request.headers.get('origin');if(config.allowed_origins?.length&&origin&&!config.allowed_origins.includes(origin))return error('Origin not allowed',403);
  const raw=await request.text();if(raw.length>16384)return error('Request body too large',413);
  let input;try{input=JSON.parse(raw)}catch{return error('Malformed JSON')};if(!Array.isArray(input.items)||!input.items.length||input.items.length>50)return error('items must be a non-empty array with at most 50 entries');
  const trusted=[];for(const item of input.items){const p=catalog.products.find(x=>x.sku===item.sku);const q=Number(item.quantity);if(!p)return error(`Unknown SKU: ${item.sku}`);if(p.availability!=='available')return error(`Unavailable SKU: ${item.sku}`);if(!Number.isInteger(q)||q<(p.cart?.min||1)||q>(p.cart?.max||99))return error(`Invalid quantity for ${item.sku}`);trusted.push({...p,quantity:q,provider:p.provider})}
  try{return json(await createCheckout(catalog.provider,trusted,config.providers[catalog.provider]||config.checkout||{},env),200,origin?{'access-control-allow-origin':origin}:{})}catch{return error('Checkout could not be created',502)}
}

export async function verifyStripe(raw,signature,secret,tolerance=300) {const parts=Object.fromEntries(signature.split(',').map(v=>v.split('=')));if(!parts.t||!parts.v1)return false;if(Math.abs(Date.now()/1000-Number(parts.t))>tolerance)return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return timingSafeEqual(hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${parts.t}.${raw}`))),parts.v1)}
export async function verifyPolar(raw,headers,secret) {const id=headers.get('webhook-id'),ts=headers.get('webhook-timestamp'),sig=(headers.get('webhook-signature')||'').replace(/^v1,/,'');if(!id||!ts||!sig)return false;const key=secret.startsWith('whsec_')?Uint8Array.from(atob(secret.slice(6)),c=>c.charCodeAt(0)):new TextEncoder().encode(secret);const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return timingSafeEqual(btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(`${id}.${ts}.${raw}`))))),sig)}
export function normalizeEvent(provider,event){const map={stripe:{'checkout.session.completed':'commerce.checkout.completed','customer.subscription.created':'commerce.subscription.created','customer.subscription.updated':'commerce.subscription.updated','customer.subscription.deleted':'commerce.subscription.cancelled','charge.refunded':'commerce.refund.created','customer.updated':'commerce.customer.updated'},polar:{'order.created':'commerce.order.created','subscription.created':'commerce.subscription.created','subscription.updated':'commerce.subscription.updated','subscription.canceled':'commerce.subscription.cancelled','customer.updated':'commerce.customer.updated'}};return{schema:'kujo-commerce-event/v1',provider,type:map[provider]?.[event.type]||'commerce.unknown',provider_event_id:event.id||'',provider_object_id:event.data?.object?.id||event.data?.id||'',skus:[],timestamp:new Date((event.created||Date.now()/1000)*1000).toISOString(),provider_event:event}}
export async function webhookHandler(request,{provider,secret}){if(request.method!=='POST')return error('Method not allowed',405);const raw=await request.text();let valid=false;if(provider==='stripe')valid=await verifyStripe(raw,request.headers.get('stripe-signature')||'',secret);if(provider==='polar')valid=await verifyPolar(raw,request.headers,secret);if(provider==='mock')valid=request.headers.get('x-kujo-mock-signature')===secret;if(!valid)return error('Invalid webhook signature',401);try{return json(normalizeEvent(provider,JSON.parse(raw)))}catch{return error('Malformed webhook payload')}}
