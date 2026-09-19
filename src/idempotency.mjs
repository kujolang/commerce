import {CONTRACT_SCHEMAS} from './contracts.mjs';

export const OPERATION_STATES=Object.freeze(['not_started','submitted','succeeded','failed','unknown','recovered','retryable_failure','terminal_failure']);
const transition=Object.freeze({not_started:['submitted'],submitted:['succeeded','failed','unknown','retryable_failure','terminal_failure'],unknown:['submitted','recovered','retryable_failure','terminal_failure'],retryable_failure:['submitted','succeeded','unknown','terminal_failure'],failed:[],succeeded:[],recovered:[],terminal_failure:[]});

export function createMemoryIdempotencyStore({now=()=>new Date().toISOString()}={}){
  const operations=new Map();
  return Object.freeze({
    async begin({operation_id,type,idempotency_key,intent}){if(!operation_id||!type||!idempotency_key)throw new Error('operation_id, type, and idempotency_key are required');const found=operations.get(operation_id);if(found){if(found.idempotency_key!==idempotency_key||JSON.stringify(found.intent)!==JSON.stringify(intent))throw new Error('semantic operation conflicts with its persisted intent');return structuredClone(found);}const record={schema:CONTRACT_SCHEMAS.providerOperation,schema_version:1,operation_id,type,idempotency_key,intent:structuredClone(intent),state:'not_started',attempts:0,created_at:now(),updated_at:now()};operations.set(operation_id,record);return structuredClone(record);},
    async get(id){const value=operations.get(id);return value?structuredClone(value):null;},
    async transition(id,state,details={}){if(!OPERATION_STATES.includes(state))throw new Error(`unknown provider operation state: ${state}`);const record=operations.get(id);if(!record)throw new Error('provider operation was not persisted');if(record.state!==state&&!transition[record.state].includes(state))throw new Error(`invalid provider operation transition: ${record.state} -> ${state}`);record.state=state;record.updated_at=now();if(state==='submitted')record.attempts+=1;if(details.result!==undefined)record.result=structuredClone(details.result);if(details.error_code)record.error_code=String(details.error_code);if(details.provider_request_id)record.provider_request_id=String(details.provider_request_id);return structuredClone(record);},
    async list(){return [...operations.values()].map(value=>structuredClone(value));}
  });
}

export async function executeProviderOperation(spec,{store,mutate,recover}){
  if(!store)throw new Error('semantic idempotency requires a persistence store');
  let record=await store.begin(spec);
  if(['succeeded','recovered'].includes(record.state))return record.result;
  if(['failed','terminal_failure'].includes(record.state))throw new Error('provider operation is terminal');
  if(record.state==='unknown'&&recover){const recovered=await recover(record);if(recovered){await store.transition(spec.operation_id,'recovered',{result:recovered});return recovered;}}
  await store.transition(spec.operation_id,'submitted');
  try{const result=await mutate(spec.idempotency_key);await store.transition(spec.operation_id,'succeeded',{result,provider_request_id:result?.provider_request_id});return result;}
  catch(error){const state=error?.terminal?'terminal_failure':error?.retryable===false?'failed':'unknown';await store.transition(spec.operation_id,state,{error_code:error?.code||'provider_outcome_unknown',provider_request_id:error?.requestId});throw error;}
}
