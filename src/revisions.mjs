import {CONTRACT_SCHEMAS} from './contracts.mjs';

const canonical=value=>{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));return value;};
export const canonicalJson=value=>JSON.stringify(canonical(value));
const hex=bytes=>[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');

export async function createOfferRevision(input,{published_at=new Date().toISOString()}={}){
  const commercial={sku:String(input.sku),variant:input.variant||null,amount:Number(input.amount),currency:String(input.currency).toUpperCase(),cadence:input.cadence||null,quantity_limits:input.quantity_limits||{min:1,max:1},provider_mapping:input.provider_mapping||{},terms_version:input.terms_version||null,consent_version:input.consent_version||null,tax_policy_reference:input.tax_policy_reference||null,successor_revision:input.successor_revision||null,retired_at:input.retired_at||null};
  if(!commercial.sku||!Number.isSafeInteger(commercial.amount)||commercial.amount<0||!/^[A-Z]{3}$/.test(commercial.currency))throw new Error('offer revision requires SKU and exact non-negative money');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(commercial)));
  return Object.freeze({schema:CONTRACT_SCHEMAS.offerRevision,schema_version:1,revision_id:`sha256:${hex(new Uint8Array(digest))}`,...canonical(commercial),published_at});
}

export function createMemoryRevisionStore(){
  const revisions=new Map();
  return Object.freeze({
    async publish(revision){const existing=revisions.get(revision.revision_id);if(existing&&canonicalJson(existing)!==canonicalJson(revision))throw new Error('published offer revisions are immutable');if(!existing)revisions.set(revision.revision_id,Object.freeze(structuredClone(revision)));return revisions.get(revision.revision_id);},
    async get(id){const value=revisions.get(id);return value?structuredClone(value):null;},
    async list(){return [...revisions.values()].map(value=>structuredClone(value));}
  });
}
