import {scopeKey,fail} from './model.mjs';

// Test/reference fixture only. The PostgreSQL store supplies process durability.
export function createMemoryPaymentStore({now=Date.now}={}){
  const orders=new Map(),inbox=new Map(),outbox=new Map(),tails=new Map();
  const key=(scope,id)=>JSON.stringify([scopeKey(scope),id]);
  async function lock(id,work){const previous=tails.get(id)||Promise.resolve();let unlock;const current=new Promise(resolve=>{unlock=resolve;});tails.set(id,current);await previous;try{return await work();}finally{unlock();if(tails.get(id)===current)tails.delete(id);}}
  return Object.freeze({
    async transact(scope,id,work){return lock(scopeKey(scope),async()=>{
      const k=key(scope,id),draft=structuredClone(orders.get(k)||null),events=[],completed=[];
      const tx={order:draft,put:value=>{tx.order=value;},emit:event=>events.push(structuredClone(event)),complete:async receipt=>{
        const row=inbox.get(key(scope,receipt.id));if(!row||row.token!==receipt.token||row.generation!==receipt.generation||row.state!=='leased')throw fail('stale_receipt');completed.push(row);
      }};
      const result=await work(tx);
      if(tx.order)orders.set(k,structuredClone(tx.order));
      for(const event of events)outbox.set(key(scope,event.event_id),{scope:structuredClone(scope),event,state:'pending'});
      for(const row of completed)row.state='processed';
      return structuredClone(result);
    });},
    async get(scope,id){return structuredClone(orders.get(key(scope,id))||null);},
    async list(scope){return [...orders.values()].filter(order=>scopeKey(order.scope)===scopeKey(scope)).map(order=>structuredClone(order));},
    async ingest(scope,event){return lock(scopeKey(scope),async()=>{const k=key(scope,event.id);if(inbox.has(k))return {duplicate:true};inbox.set(k,{scope:structuredClone(scope),event:structuredClone(event),id:event.id,state:'ready',generation:0,attempts:0,available_at:now()});return {duplicate:false};});},
    async lease(scope,{leaseMs=30000}={}){return lock(scopeKey(scope),async()=>{const row=[...inbox.values()].find(item=>scopeKey(item.scope)===scopeKey(scope)&&(item.state==='ready'&&item.available_at<=now()||item.state==='leased'&&item.lease_until<=now()));if(!row)return null;Object.assign(row,{state:'leased',token:crypto.randomUUID(),generation:row.generation+1,attempts:row.attempts+1,lease_until:now()+leaseMs});return structuredClone(row);});},
    async retry(scope,receipt,{maxAttempts=5,delayMs=1000}={}){return lock(scopeKey(scope),async()=>{const row=inbox.get(key(scope,receipt.id));if(!row||row.token!==receipt.token||row.generation!==receipt.generation||row.state!=='leased')throw fail('stale_receipt');row.state=row.attempts>=maxAttempts?'dead':'ready';row.available_at=now()+delayMs;});},
    async inbox(scope){return [...inbox.values()].filter(row=>scopeKey(row.scope)===scopeKey(scope)).map(row=>structuredClone(row));},
    async outbox(scope){return [...outbox.values()].filter(row=>scopeKey(row.scope)===scopeKey(scope)).map(row=>structuredClone(row));},
    async delivered(scope,eventId){const row=outbox.get(key(scope,eventId));if(row)row.state='delivered';}
  });
}
