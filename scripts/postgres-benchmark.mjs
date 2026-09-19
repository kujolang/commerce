import pg from 'pg';
import {createPostgresCommerce} from '../adapters/postgres.mjs';

const url=process.env.COMMERCE_POSTGRES_URL;if(!url)throw new Error('COMMERCE_POSTGRES_URL is required');
const count=Math.max(1,Math.min(10000,Number(process.env.COMMERCE_POSTGRES_BENCHMARK_EVENTS||1000))),budgetMs=Math.max(1000,Number(process.env.COMMERCE_POSTGRES_BENCHMARK_BUDGET_MS||30000)),schema=`benchmark_${process.pid}_${Date.now()}`;
const pool=new pg.Pool({connectionString:url,max:16,connectionTimeoutMillis:5000}),stores=createPostgresCommerce({pool,schema,leaseMs:1000});
const elapsed=async work=>{const start=performance.now();await work();return Math.round(performance.now()-start);};
const batches=async(items,size,work)=>{for(let offset=0;offset<items.length;offset+=size)await Promise.all(items.slice(offset,offset+size).map(work));};
const events=Array.from({length:count},(_,index)=>({provider:'mock',provider_event_id:`benchmark-${index}`,provider_object_id:`object-${index}`,type:'commerce.payment.succeeded',timestamp:'2026-01-01T00:00:00.000Z',skus:['BENCHMARK']}));

try{
  await stores.migrate();
  const ingressMs=await elapsed(()=>batches(events,64,event=>stores.ingress.claimAndEnqueue(event)));
  const duplicatesMs=await elapsed(()=>batches(events,64,event=>stores.ingress.claimAndEnqueue(event)));
  let processed=0;const workers=Array.from({length:8},async()=>{for(;;){const job=await stores.queue.lease();if(!job)return;await stores.queue.complete(job.id);processed+=1;}});
  const queueMs=await elapsed(()=>Promise.all(workers));
  const outboxEvents=events.map((event,index)=>({event_id:event.provider_event_id,aggregate_id:event.provider_object_id,aggregate_version:index+1,type:event.type,occurred_at:event.timestamp,status:'succeeded'}));
  const outboxAppendMs=await elapsed(()=>batches(outboxEvents,64,event=>stores.outbox.append(event)));
  let leased=0;const outboxLeaseMs=await elapsed(async()=>{for(;;){const entries=await stores.outbox.leasePending(100);if(!entries.length)return;leased+=entries.length;await Promise.all(entries.map(entry=>stores.outbox.delivered(entry.id)));}});
  const results={events:count,ingress_ms:ingressMs,duplicate_storm_ms:duplicatesMs,queue_drain_ms:queueMs,outbox_append_ms:outboxAppendMs,outbox_drain_ms:outboxLeaseMs,processed,leased,budget_ms:budgetMs};
  if(processed!==count||leased!==count||[ingressMs,duplicatesMs,queueMs,outboxAppendMs,outboxLeaseMs].some(value=>value>budgetMs))throw new Error(`PostgreSQL benchmark budget failed: ${JSON.stringify(results)}`);
  console.log(JSON.stringify({ok:true,...results}));
}finally{
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
}
