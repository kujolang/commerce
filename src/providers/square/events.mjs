import {event} from '../common.mjs';

const squareEvents={'payment.created':'commerce.payment.created','payment.updated':'commerce.payment.updated','order.created':'commerce.order.created','order.updated':'commerce.order.updated','refund.created':'commerce.refund.created','refund.updated':'commerce.refund.updated','subscription.created':'commerce.subscription.created','subscription.updated':'commerce.subscription.updated','invoice.payment_made':'commerce.payment.succeeded','invoice.scheduled_charge_failed':'commerce.payment.failed','dispute.created':'commerce.dispute.created','dispute.state_changed':'commerce.dispute.updated'};

export const eventMethods={
  verifyWebhook:async({raw,request,secret,config})=>verifySquareSignature({raw,signature:request.headers.get('x-square-hmacsha256-signature'),secret,notificationUrl:config.notification_url}),normalizeWebhookEvent:input=>{const object=input.data?.object||{},map=Object.assign(Object.create(null),squareEvents);if(input.type==='payment.updated'&&object.payment?.status==='COMPLETED')map[input.type]='commerce.checkout.completed';return event('square',{...input,type:input.type||'unknown'},map,object.subscription||object.payment||object.refund||object.dispute||object.invoice||object);}
};

// Web Crypto verifies decoded MAC bytes without a JavaScript equality loop.
export async function verifySquareSignature({raw,signature,secret,notificationUrl}){
  if(!secret||!notificationUrl||typeof signature!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(signature))return false;
  try{
    const prefix=new TextEncoder().encode(notificationUrl),body=typeof raw==='string'?new TextEncoder().encode(raw):raw;
    const bytes=new Uint8Array(prefix.length+body.length);bytes.set(prefix);bytes.set(body,prefix.length);
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(signature),character=>character.charCodeAt(0)),bytes);
  }catch{return false;}
}
