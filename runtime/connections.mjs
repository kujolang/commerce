import {readBytes} from '../src/payments/webhooks.mjs';
import {verifySquareSignature} from '../src/providers/square/events.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
export function createConnectionHandlers({connections,authorize,origin,connectionId='square'}={}){
  if(!connections||!authorize||!origin)throw new Error('Authenticated connection host required');
  const allowedOrigin=new URL(origin).origin;
  async function admin(request,action,work,get=false){
    if(request.method!==(get?'GET':'POST'))return json({error:'method_not_allowed'},405);
    if(!get&&request.headers.get('origin')!==allowedOrigin)return json({error:'origin_rejected'},403);
    try{
      const principal=await authorize(request,{action});if(!principal?.id||!principal.merchant_id||!principal.permissions?.includes('connections.manage'))return json({error:'admin_required'},403);
      const binding={merchant_id:principal.merchant_id,connection_id:connectionId};return await work(principal,binding);
    }catch{return json({error:'connection_action_unavailable'},409);}
  }
  return Object.freeze({
    connect:request=>admin(request,'connection.connect',async(principal,binding)=>json(await connections.authorize({...binding,actor:principal.id}))),
    callback:request=>admin(request,'connection.callback',async principal=>{const url=new URL(request.url);return json(await connections.callback({state:url.searchParams.get('state'),code:url.searchParams.get('code'),error:url.searchParams.get('error'),actor:principal.id,merchant_id:principal.merchant_id}));},true),
    status:request=>admin(request,'connection.status',async(_principal,binding)=>json(await connections.status(binding)),true),
    locations:request=>admin(request,'connection.locations',async(_principal,binding)=>json(await connections.locations(binding)),true),
    selectLocation:request=>admin(request,'connection.location',async(_principal,binding)=>{const body=JSON.parse(new TextDecoder().decode(await readBytes(request,2048)));return json(await connections.selectLocation(binding,body.location_id));}),
    refresh:request=>admin(request,'connection.refresh',async(_principal,binding)=>json(await connections.refresh(binding))),
    disconnect:request=>admin(request,'connection.disconnect',async(_principal,binding)=>json(await connections.revoke(binding)))
  });
}
export function createRevocationWebhook({connections,binding,secret,notificationUrl}){
  return async request=>{
    if(request.method!=='POST')return new Response(null,{status:405});
    try{const raw=await readBytes(request,65536);if(!await verifySquareSignature({raw,signature:request.headers.get('x-square-hmacsha256-signature'),secret,notificationUrl}))return new Response(null,{status:401});const event=JSON.parse(new TextDecoder().decode(raw));if(event.type!=='oauth.authorization.revoked')return new Response(null,{status:204});await connections.markRevoked(binding,event.merchant_id);return new Response(null,{status:204});}catch{return new Response(null,{status:503});}
  };
}
