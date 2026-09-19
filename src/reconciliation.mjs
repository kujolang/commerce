import {CONTRACT_SCHEMAS} from './contracts.mjs';

export function convergeProviderState(current,incoming){
  if(!current)return structuredClone(incoming);const currentVersion=Number(current.version??-1),incomingVersion=Number(incoming.version??-1);
  if(Number.isFinite(currentVersion)&&Number.isFinite(incomingVersion)&&incomingVersion<currentVersion)return structuredClone(current);
  const currentTime=Date.parse(current.updated_at||current.created_at||0),incomingTime=Date.parse(incoming.updated_at||incoming.created_at||0);
  if(incomingVersion===currentVersion&&Number.isFinite(currentTime)&&Number.isFinite(incomingTime)&&incomingTime<currentTime)return structuredClone(current);
  return {...structuredClone(current),...structuredClone(incoming)};
}

export function createMemoryReconciliationStore(){const mappings=new Map(),cursors=new Map(),findings=[];return Object.freeze({async getMapping(key){return structuredClone(mappings.get(key)||null);},async putMapping(key,value){mappings.set(key,structuredClone(value));},async getCursor(provider,kind){return structuredClone(cursors.get(`${provider}:${kind}`)||null);},async putCursor(provider,kind,value){cursors.set(`${provider}:${kind}`,structuredClone(value));},async recordFinding(finding){findings.push(structuredClone(finding));},async listFindings(){return findings.map(value=>structuredClone(value));}});}

export async function reconcileObject({providerAdapter,provider,type,id,local,store,config={},env={},policy='report',context={}}){
  if(!providerAdapter.capabilities.direct_reconciliation||typeof providerAdapter.reconcileObject!=='function')throw new Error(`${provider} does not support direct reconciliation`);
  const remote=await providerAdapter.reconcileObject({type,id},config,env,context);if(!remote)throw new Error('provider object was not found');const converged=convergeProviderState(local,remote),drift=JSON.stringify(converged)!==JSON.stringify(local);
  const result={schema:CONTRACT_SCHEMAS.reconciliationResult,schema_version:1,provider,type,provider_id:id,status:drift?'drift':'in_sync',checked_at:new Date().toISOString(),local:local||null,remote,converged};
  if(drift)await store?.recordFinding(result);if(drift&&policy==='repair')await store?.putMapping(`${provider}:${type}:${id}`,converged);return result;
}

export async function reconcilePages({listPage,store,provider,kind,cursor,maxPages=10,overlapMs=300000,process}){let next=cursor??await store?.getCursor(provider,kind),pages=0,count=0;while(pages<maxPages){const page=await listPage({cursor:next,overlapMs});pages+=1;for(const item of page.items||[]){await process(item);count+=1;}next=page.next_cursor||null;await store?.putCursor(provider,kind,{cursor:next,watermark:page.watermark||new Date().toISOString()});if(!next)break;}return{pages,count,truncated:Boolean(next),cursor:next};}
