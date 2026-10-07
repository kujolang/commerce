import {scopeKey,fail,locateInOrder} from './model.mjs';

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
    async locate(scope,reference){const matches=[...orders.values()].filter(order=>scopeKey(order.scope)===scopeKey(scope)).flatMap(order=>locateInOrder(order,reference));if(matches.length>1)throw fail('ambiguous_local_reference');return matches[0]||null;},
    async list(scope,{afterId='',limit=100}={}){return [...orders.values()].filter(order=>scopeKey(order.scope)===scopeKey(scope)&&order.id>afterId).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).slice(0,limit).map(order=>structuredClone(order));},
    async ingest(scope,event){return lock(scopeKey(scope),async()=>{const k=key(scope,event.id);if(inbox.has(k))return {duplicate:true};inbox.set(k,{scope:structuredClone(scope),event:structuredClone(event),id:event.id,state:'ready',generation:0,attempts:0,available_at:now()});return {duplicate:false};});},
    async lease(scope,{leaseMs=30000}={}){return lock(scopeKey(scope),async()=>{const row=[...inbox.values()].find(item=>scopeKey(item.scope)===scopeKey(scope)&&(item.state==='ready'&&item.available_at<=now()||item.state==='leased'&&item.lease_until<=now()));if(!row)return null;Object.assign(row,{state:'leased',token:crypto.randomUUID(),generation:row.generation+1,attempts:row.attempts+1,lease_until:now()+leaseMs});return structuredClone(row);});},
    async retry(scope,receipt,{maxAttempts=5,delayMs=1000}={}){return lock(scopeKey(scope),async()=>{const row=inbox.get(key(scope,receipt.id));if(!row||row.token!==receipt.token||row.generation!==receipt.generation||row.state!=='leased')throw fail('stale_receipt');row.state=row.attempts>=maxAttempts?'dead':'ready';row.available_at=now()+delayMs;});},
    async replay(scope,id,actor){return lock(scopeKey(scope),async()=>{if(!actor)throw fail('operator_required');const row=inbox.get(key(scope,id));if(row?.state!=='dead')throw fail('receipt_not_dead');row.state='ready';row.attempts=0;row.generation++;row.available_at=now();const event={schema:'kujo-commerce-downstream-event/v1',schema_version:1,event_id:crypto.randomUUID(),aggregate_id:id,aggregate_version:row.generation,type:'receipt.replayed',occurred_at:new Date(now()).toISOString(),data:{scope,actor}};outbox.set(key(scope,event.event_id),{scope:structuredClone(scope),event,state:'pending'});return {id,state:'ready'};});},
    async inbox(scope){return [...inbox.values()].filter(row=>scopeKey(row.scope)===scopeKey(scope)).map(row=>structuredClone(row));},
    async outbox(scope,{pending=false,limit=1000}={}){return [...outbox.values()].filter(row=>scopeKey(row.scope)===scopeKey(scope)&&(!pending||row.state==='pending')).slice(0,limit).map(row=>structuredClone(row));},
    async delivered(scope,eventId){const row=outbox.get(key(scope,eventId));if(row)row.state='delivered';}
  });
}
