import {fail} from '../payments/model.mjs';
export function createMemoryConnectionStore({now=Date.now}={}){
  const rows=new Map(),states=new Map();let tail=Promise.resolve();
  const serial=async work=>{const previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});await previous;try{return await work();}finally{release();}};
  return Object.freeze({
    async transact(id,work){return serial(async()=>{const tx={record:structuredClone(rows.get(id)||null)};const result=await work(tx);if(tx.record)rows.set(id,structuredClone(tx.record));return structuredClone(result);});},
    async get(id){return structuredClone(rows.get(id)||null);},
    async putState(hash,record){return serial(async()=>{if(states.has(hash))throw fail('state_conflict');states.set(hash,structuredClone(record));});},
    async consumeState(hash,actor){return serial(async()=>{const record=states.get(hash);if(!record||record.actor!==actor||record.expires_at<=now()||record.consumed)throw fail('invalid_oauth_state');record.consumed=true;return structuredClone(record);});}
  });
}
