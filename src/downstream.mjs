import {downstreamEvent} from './contracts.mjs';
import {hmacSha256,timingSafeEqual} from './provider-utils.mjs';

const bodyFor=(timestamp,keyId,event)=>`${timestamp}.${keyId}.${JSON.stringify(event)}`;
export async function signDownstreamEvent(input,{key_id,secret,now=()=>Math.floor(Date.now()/1000)}={}){
  if(!key_id||!secret)throw new Error('downstream signing key id and secret are required');const event=downstreamEvent(input),timestamp=now();return{event,headers:{'commerce-signature-version':'v1','commerce-signature-key-id':key_id,'commerce-signature-timestamp':String(timestamp),'commerce-signature':await hmacSha256(secret,bodyFor(timestamp,key_id,event))}};
}

export async function verifyDownstreamEvent({event,headers},{keys,toleranceSeconds=300,now=()=>Math.floor(Date.now()/1000),replayStore}={}){
  const keyId=headers['commerce-signature-key-id']||headers.get?.('commerce-signature-key-id'),timestamp=Number(headers['commerce-signature-timestamp']||headers.get?.('commerce-signature-timestamp')),signature=headers['commerce-signature']||headers.get?.('commerce-signature'),version=headers['commerce-signature-version']||headers.get?.('commerce-signature-version');
  const secret=keys?.[keyId];if(version!=='v1'||!secret||!Number.isFinite(timestamp)||Math.abs(now()-timestamp)>toleranceSeconds)return false;
  const expected=await hmacSha256(secret,bodyFor(timestamp,keyId,event));if(!timingSafeEqual(expected,signature))return false;
  if(replayStore){const replayKey=`${keyId}:${timestamp}:${signature}`;if(!(await replayStore.claim(replayKey)))return false;}
  return true;
}

export function createMemoryReplayStore(){const seen=new Set();return Object.freeze({async claim(id){if(seen.has(id))return false;seen.add(id);return true;},clear(){seen.clear();}});}

export function createMemoryOutbox(){const entries=[];return Object.freeze({async append(event){const entry={id:event.event_id,event:structuredClone(event),state:'pending',attempts:0};if(!entries.some(value=>value.id===entry.id))entries.push(entry);return structuredClone(entries.find(value=>value.id===entry.id));},async pending(limit=100){return entries.filter(value=>value.state==='pending').slice(0,limit).map(value=>structuredClone(value));},async attempted(id,error){const value=entries.find(item=>item.id===id);value.attempts+=1;value.last_error=error?String(error.message||error):undefined;},async delivered(id){const value=entries.find(item=>item.id===id);value.state='delivered';},async deadLettered(id){const value=entries.find(item=>item.id===id);value.state='dead_lettered';},async list(){return entries.map(value=>structuredClone(value));}});}

export async function deliverOutbox({outbox,publisher,deadLetters,maxAttempts=5}){const results=[];for(const entry of await outbox.pending()){try{await publisher.publish(entry.event);await outbox.attempted(entry.id);await outbox.delivered(entry.id);results.push({id:entry.id,status:'delivered'});}catch(error){await outbox.attempted(entry.id,error);if(entry.attempts+1>=maxAttempts){await outbox.deadLettered(entry.id);await deadLetters?.put({id:entry.id,payload:entry.event,attempt:entry.attempts+1},error);results.push({id:entry.id,status:'dead_lettered'});}else results.push({id:entry.id,status:'retrying'});}}return results;}

export function createSignedHttpPublisher({url,key_id,secret,fetch:requestFetch=globalThis.fetch,timeoutMs=5000}){const target=new URL(url);if(target.protocol!=='https:')throw new Error('downstream publisher requires HTTPS');return Object.freeze({async publish(event){const signed=await signDownstreamEvent(event,{key_id,secret});const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await requestFetch(target,{method:'POST',headers:{'content-type':'application/json',...signed.headers},body:JSON.stringify(signed.event),signal:controller.signal});if(!response.ok)throw new Error(`downstream consumer returned HTTP ${response.status}`);}finally{clearTimeout(timer);}}});}
