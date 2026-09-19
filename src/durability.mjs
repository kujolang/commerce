const clone=value=>structuredClone(value);

export function createMemoryEventReceiptStore({now=Date.now,leaseMs=30000}={}){
  const receipts=new Map();
  return Object.freeze({
    async claim(event,{raw}={}){const id=event.provider_event_id,current=receipts.get(id),time=now();if(current?.status==='processed'||(['claimed','queued'].includes(current?.status)&&current.lease_expires_at>time))return{claimed:false,receipt:current&&clone(current)};const receipt=current||{event_id:id,provider:event.provider,received_at:time,attempts:0};Object.assign(receipt,{status:'claimed',lease_expires_at:time+leaseMs,event:clone(event),raw:raw===undefined?receipt.raw:raw,attempts:receipt.attempts+1});receipts.set(id,receipt);return{claimed:true,receipt:clone(receipt)};},
    async markQueued(id){const value=receipts.get(id);if(!value)throw new Error('receipt not found');value.status='queued';return clone(value);},
    async markProcessed(id){const value=receipts.get(id);if(!value)throw new Error('receipt not found');value.status='processed';delete value.lease_expires_at;return clone(value);},
    async release(id,error){const value=receipts.get(id);if(value){value.status='failed';value.last_error=String(error?.message||error||'processing failed');value.lease_expires_at=0;}},
    async get(id){const value=receipts.get(id);return value?clone(value):null;},async list(){return[...receipts.values()].map(value=>clone(value));}
  });
}

export function createMemoryDurableQueue({now=Date.now}={}){
  const jobs=new Map(),ready=[],leased=new Set();let sequence=0;
  return Object.freeze({
    async enqueue(payload,{available_at=now(),attempt=0}={}){const job={id:`job_${++sequence}`,payload:clone(payload),attempt,available_at,status:'ready'};jobs.set(job.id,job);ready.push(job.id);return clone(job);},
    async lease({leaseMs=30000}={}){const time=now();let job;for(const id of leased){const candidate=jobs.get(id);if(candidate?.lease_expires_at<=time){job=candidate;break;}}for(let remaining=ready.length;!job&&remaining>0;remaining-=1){const id=ready.shift(),candidate=jobs.get(id);if(candidate?.status==='ready'&&candidate.available_at<=time)job=candidate;else if(candidate?.status==='ready')ready.push(id);}if(!job)return null;leased.add(job.id);job.status='leased';job.lease_expires_at=time+leaseMs;job.attempt+=1;return clone(job);},
    async complete(id){const job=jobs.get(id);if(job)job.status='complete';leased.delete(id);},
    async retry(id,{delayMs=0,error}={}){const job=jobs.get(id);if(!job)throw new Error('job not found');leased.delete(id);job.status='ready';job.available_at=now()+delayMs;job.last_error=String(error?.message||error||'processing failed');ready.push(id);},
    async get(id){const job=jobs.get(id);return job?clone(job):null;},async list(){return[...jobs.values()].map(value=>clone(value));}
  });
}

export function createMemoryDeadLetterStore(){const entries=new Map(),key=(id,kind='event_processing')=>`${kind}:${id}`;return Object.freeze({async put(job,error){const value={...clone(job),kind:job.kind||'event_processing',dead_lettered_at:new Date().toISOString(),last_error:String(error?.message||error)};entries.set(key(job.id,value.kind),value);return clone(value);},async get(id,kind='event_processing'){const value=entries.get(key(id,kind));return value?clone(value):null;},async remove(id,kind='event_processing'){const entryKey=key(id,kind),value=entries.get(entryKey);entries.delete(entryKey);return value?clone(value):null;},async list(){return[...entries.values()].map(value=>clone(value));}});}

export function createReplayController({deadLetters,queue,audit=async()=>{}}){return Object.freeze({async replay(id,actor){const job=await deadLetters.get(id);if(!job)throw new Error('dead letter not found');await audit({action:'event.replay',actor,job_id:id,occurred_at:new Date().toISOString()});const replayed=await queue.enqueue(job.payload);await deadLetters.remove(id);return replayed;}});}

export async function processNext({queue,receipts,deadLetters,processor,maxAttempts=5,baseDelayMs=1000}){
  const job=await queue.lease();if(!job)return null;
  try{await processor(job.payload);await receipts?.markProcessed(job.payload.provider_event_id);await queue.complete(job.id);return{status:'processed',job_id:job.id};}
  catch(error){if(job.attempt>=maxAttempts){await deadLetters.put({...job,kind:'event_processing'},error);await queue.complete(job.id);await receipts?.release(job.payload.provider_event_id,error);return{status:'dead_lettered',job_id:job.id};}await queue.retry(job.id,{delayMs:Math.min(60000,baseDelayMs*2**(job.attempt-1)),error});return{status:'retrying',job_id:job.id};}
}
