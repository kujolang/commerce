import {canonicalJson} from '../src/revisions.mjs';
import {CONTRACT_SCHEMAS} from '../src/contracts.mjs';

const IDENTIFIER=/^[a-z_][a-z0-9_]{0,62}$/;
const clone=value=>value==null?value:structuredClone(value);
const duration=value=>Math.max(1,Math.trunc(Number(value)||1));
const rowJob=row=>row&&({id:row.id,payload:clone(row.payload),attempt:Number(row.attempts),available_at:new Date(row.available_at).getTime(),lease_expires_at:row.lease_expires_at?new Date(row.lease_expires_at).getTime():undefined,status:row.status,last_error:row.last_error||undefined});
const operationTransitions=Object.freeze({submitted:['not_started','unknown','retryable_failure'],succeeded:['submitted','retryable_failure'],failed:['submitted'],unknown:['submitted'],recovered:['unknown'],retryable_failure:['submitted','unknown'],terminal_failure:['submitted','unknown','retryable_failure']});

function schemaName(value){if(!IDENTIFIER.test(value))throw new Error('PostgreSQL schema must be a safe lowercase identifier');return value;}
async function transaction(pool,work){const client=await pool.connect();try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}

export function postgresMigrationSql({schema='commerce'}={}){const s=schemaName(schema);return `
CREATE SCHEMA IF NOT EXISTS ${s};
CREATE TABLE IF NOT EXISTS ${s}.offer_revisions (
  revision_id text PRIMARY KEY,
  revision jsonb NOT NULL,
  published_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ${s}.provider_operations (
  operation_id text PRIMARY KEY,
  schema_name text NOT NULL DEFAULT '${CONTRACT_SCHEMAS.providerOperation}',
  schema_version integer NOT NULL DEFAULT 1,
  operation_type text NOT NULL,
  idempotency_key text NOT NULL,
  intent jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('not_started','submitted','succeeded','failed','unknown','recovered','retryable_failure','terminal_failure')),
  attempts integer NOT NULL DEFAULT 0,
  result jsonb,
  error_code text,
  provider_request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ${s}.event_receipts (
  provider_event_id text PRIMARY KEY,
  provider text NOT NULL,
  status text NOT NULL CHECK (status IN ('claimed','queued','processed','failed')),
  event jsonb NOT NULL,
  raw_body text,
  received_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 1,
  last_error text
);
CREATE TABLE IF NOT EXISTS ${s}.queue_jobs (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('ready','leased','complete')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS queue_jobs_ready_idx ON ${s}.queue_jobs (status,available_at,created_at);
CREATE TABLE IF NOT EXISTS ${s}.dead_letters (
  kind text NOT NULL CHECK (kind IN ('event_processing','downstream_delivery')),
  id text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text NOT NULL,
  dead_lettered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind,id)
);
CREATE TABLE IF NOT EXISTS ${s}.reconciliation_cursors (
  provider text NOT NULL,
  kind text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider,kind)
);
CREATE TABLE IF NOT EXISTS ${s}.drift_findings (
  id bigserial PRIMARY KEY,
  finding jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ${s}.downstream_outbox (
  event_id text PRIMARY KEY,
  event jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','leased','delivered','dead_lettered')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS downstream_outbox_pending_idx ON ${s}.downstream_outbox (state,available_at,created_at);
CREATE TABLE IF NOT EXISTS ${s}.replay_claims (
  fingerprint text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ${s}.operator_audit (
  id bigserial PRIMARY KEY,
  record jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ${s}.consumed_downstream_events (
  event_id text PRIMARY KEY,
  signature_fingerprint text NOT NULL UNIQUE,
  event jsonb NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now()
);
`}

export function createPostgresCommerce({pool,schema='commerce',leaseMs=30000,rawEventArchive=false}={}){
  if(!pool?.query||!pool?.connect)throw new Error('PostgreSQL adapter requires a node-postgres compatible pool');const s=schemaName(schema),table=name=>`${s}.${name}`,defaultLease=duration(leaseMs);
  const enqueue=async(client,payload,{available_at=new Date(),attempt=0,id=crypto.randomUUID()}={})=>{const result=await client.query(`INSERT INTO ${table('queue_jobs')} (id,payload,status,attempts,available_at) VALUES ($1,$2,'ready',$3,$4) RETURNING *`,[id,payload,attempt,available_at]);return rowJob(result.rows[0]);};
  const receiptClaim=async(client,event,{raw,lease=defaultLease,reclaimExpired=true}={})=>{const result=await client.query(`INSERT INTO ${table('event_receipts')} (provider_event_id,provider,status,event,raw_body,lease_expires_at) VALUES ($1,$2,'claimed',$3,$4,now()+$5*interval '1 millisecond') ON CONFLICT (provider_event_id) DO UPDATE SET status='claimed',event=EXCLUDED.event,raw_body=COALESCE(EXCLUDED.raw_body,${table('event_receipts')}.raw_body),lease_expires_at=EXCLUDED.lease_expires_at,attempts=${table('event_receipts')}.attempts+1,last_error=NULL WHERE ${table('event_receipts')}.status='failed' OR ($6 AND ${table('event_receipts')}.status IN ('claimed','queued') AND ${table('event_receipts')}.lease_expires_at<=now()) RETURNING *`,[event.provider_event_id,event.provider,event,rawEventArchive?raw:null,duration(lease),reclaimExpired]);return result.rows[0]||null;};

  const revisionStore=Object.freeze({
    async publish(revision){return transaction(pool,async client=>{await client.query(`INSERT INTO ${table('offer_revisions')} (revision_id,revision,published_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,[revision.revision_id,revision,revision.published_at]);const current=(await client.query(`SELECT revision FROM ${table('offer_revisions')} WHERE revision_id=$1 FOR UPDATE`,[revision.revision_id])).rows[0]?.revision;if(canonicalJson(current)!==canonicalJson(revision))throw new Error('published offer revisions are immutable');return clone(current);});},
    async get(id){return clone((await pool.query(`SELECT revision FROM ${table('offer_revisions')} WHERE revision_id=$1`,[id])).rows[0]?.revision||null);},
    async list(){return(await pool.query(`SELECT revision FROM ${table('offer_revisions')} ORDER BY published_at,revision_id`)).rows.map(row=>clone(row.revision));}
  });
  const operationStore=Object.freeze({
    async begin({operation_id,type,idempotency_key,intent}){return transaction(pool,async client=>{await client.query(`INSERT INTO ${table('provider_operations')} (operation_id,operation_type,idempotency_key,intent,state) VALUES ($1,$2,$3,$4,'not_started') ON CONFLICT DO NOTHING`,[operation_id,type,idempotency_key,intent]);const row=(await client.query(`SELECT * FROM ${table('provider_operations')} WHERE operation_id=$1 FOR UPDATE`,[operation_id])).rows[0];if(row.idempotency_key!==idempotency_key||canonicalJson(row.intent)!==canonicalJson(intent))throw new Error('semantic operation conflicts with its persisted intent');return{schema:row.schema_name,schema_version:row.schema_version,operation_id:row.operation_id,type:row.operation_type,idempotency_key:row.idempotency_key,intent:clone(row.intent),state:row.state,attempts:row.attempts,result:clone(row.result),error_code:row.error_code,provider_request_id:row.provider_request_id,created_at:row.created_at.toISOString(),updated_at:row.updated_at.toISOString()};});},
    async get(id){const row=(await pool.query(`SELECT * FROM ${table('provider_operations')} WHERE operation_id=$1`,[id])).rows[0];return row&&{schema:row.schema_name,schema_version:row.schema_version,operation_id:row.operation_id,type:row.operation_type,idempotency_key:row.idempotency_key,intent:clone(row.intent),state:row.state,attempts:row.attempts,result:clone(row.result),error_code:row.error_code,provider_request_id:row.provider_request_id,created_at:row.created_at.toISOString(),updated_at:row.updated_at.toISOString()};},
    async transition(id,state,details={}){const from=operationTransitions[state];if(!from)throw new Error(`unknown provider operation state: ${state}`);const result=await pool.query(`UPDATE ${table('provider_operations')} SET state=$2,attempts=attempts+CASE WHEN $2='submitted' THEN 1 ELSE 0 END,result=COALESCE($3,result),error_code=COALESCE($4,error_code),provider_request_id=COALESCE($5,provider_request_id),updated_at=now() WHERE operation_id=$1 AND state=ANY($6::text[]) RETURNING operation_id,state,attempts,result,error_code,provider_request_id`,[id,state,details.result??null,details.error_code||null,details.provider_request_id||null,from]);if(!result.rows[0])throw new Error('invalid or concurrent provider operation transition');return clone(result.rows[0]);},
    async list(){return(await pool.query(`SELECT operation_id,operation_type AS type,idempotency_key,intent,state,attempts,result,error_code,provider_request_id,created_at,updated_at FROM ${table('provider_operations')} ORDER BY created_at`)).rows.map(row=>clone(row));}
  });
  const receiptStore=Object.freeze({
    async claim(event,options={}){const row=await receiptClaim(pool,event,options);return{claimed:Boolean(row),receipt:clone(row)};},
    async markQueued(id){return clone((await pool.query(`UPDATE ${table('event_receipts')} SET status='queued' WHERE provider_event_id=$1 RETURNING *`,[id])).rows[0]);},
    async markProcessed(id){return clone((await pool.query(`UPDATE ${table('event_receipts')} SET status='processed',lease_expires_at=NULL WHERE provider_event_id=$1 RETURNING *`,[id])).rows[0]);},
    async release(id,error){await pool.query(`UPDATE ${table('event_receipts')} SET status='failed',lease_expires_at=NULL,last_error=$2 WHERE provider_event_id=$1`,[id,String(error?.message||error||'processing failed')]);},
    async get(id){return clone((await pool.query(`SELECT * FROM ${table('event_receipts')} WHERE provider_event_id=$1`,[id])).rows[0]||null);},async list(){return(await pool.query(`SELECT * FROM ${table('event_receipts')} ORDER BY received_at`)).rows.map(row=>clone(row));}
  });
  const queue=Object.freeze({
    async enqueue(payload,options){return enqueue(pool,payload,options);},
    async lease({leaseMs:requested=defaultLease}={}){return transaction(pool,async client=>{const result=await client.query(`WITH candidate AS (SELECT id FROM ${table('queue_jobs')} WHERE (status='ready' AND available_at<=now()) OR (status='leased' AND lease_expires_at<=now()) ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE ${table('queue_jobs')} job SET status='leased',attempts=attempts+1,lease_expires_at=now()+$1*interval '1 millisecond',updated_at=now() FROM candidate WHERE job.id=candidate.id RETURNING job.*`,[duration(requested)]);return rowJob(result.rows[0]);});},
    async complete(id){await pool.query(`UPDATE ${table('queue_jobs')} SET status='complete',lease_expires_at=NULL,updated_at=now() WHERE id=$1`,[id]);},
    async retry(id,{delayMs=0,error}={}){await pool.query(`UPDATE ${table('queue_jobs')} SET status='ready',available_at=now()+$2*interval '1 millisecond',lease_expires_at=NULL,last_error=$3,updated_at=now() WHERE id=$1`,[id,Math.max(0,Number(delayMs)||0),String(error?.message||error||'processing failed')]);},
    async get(id){return rowJob((await pool.query(`SELECT * FROM ${table('queue_jobs')} WHERE id=$1`,[id])).rows[0]);},async list(){return(await pool.query(`SELECT * FROM ${table('queue_jobs')} ORDER BY created_at`)).rows.map(rowJob);}
  });
  const ingress=Object.freeze({async claimAndEnqueue(event,{raw}={}){return transaction(pool,async client=>{const receipt=await receiptClaim(client,event,{raw,reclaimExpired:false});if(!receipt)return{duplicate:true};const job=await enqueue(client,event);await client.query(`UPDATE ${table('event_receipts')} SET status='queued' WHERE provider_event_id=$1`,[event.provider_event_id]);return{duplicate:false,job};});}});
  const deadLetters=Object.freeze({async put(job,error){const kind=job.kind||'event_processing',result=await pool.query(`INSERT INTO ${table('dead_letters')} (kind,id,payload,attempts,last_error) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (kind,id) DO UPDATE SET payload=EXCLUDED.payload,attempts=EXCLUDED.attempts,last_error=EXCLUDED.last_error,dead_lettered_at=now() RETURNING *`,[kind,job.id,job.payload,job.attempt||job.attempts||0,String(error?.message||error)]);return clone(result.rows[0]);},async get(id,kind='event_processing'){return clone((await pool.query(`SELECT * FROM ${table('dead_letters')} WHERE kind=$1 AND id=$2`,[kind,id])).rows[0]||null);},async remove(id,kind='event_processing'){return clone((await pool.query(`DELETE FROM ${table('dead_letters')} WHERE kind=$1 AND id=$2 RETURNING *`,[kind,id])).rows[0]||null);},async list(){return(await pool.query(`SELECT * FROM ${table('dead_letters')} ORDER BY dead_lettered_at`)).rows.map(row=>clone(row));}});
  const reconciliationStore=Object.freeze({async getCursor(provider,kind){return clone((await pool.query(`SELECT value FROM ${table('reconciliation_cursors')} WHERE provider=$1 AND kind=$2`,[provider,kind])).rows[0]?.value||null);},async putCursor(provider,kind,value){await pool.query(`INSERT INTO ${table('reconciliation_cursors')} (provider,kind,value) VALUES ($1,$2,$3) ON CONFLICT (provider,kind) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[provider,kind,value]);},async recordFinding(finding){await pool.query(`INSERT INTO ${table('drift_findings')} (finding) VALUES ($1)`,[finding]);},async listFindings(){return(await pool.query(`SELECT finding FROM ${table('drift_findings')} ORDER BY recorded_at`)).rows.map(row=>clone(row.finding));},async getMapping(){return null;},async putMapping(){throw new Error('application projection mappings require an application-owned table');}});
  const replayStore=Object.freeze({async claim(fingerprint,{ttlSeconds=600}={}){const result=await pool.query(`INSERT INTO ${table('replay_claims')} (fingerprint,expires_at) VALUES ($1,now()+$2*interval '1 second') ON CONFLICT (fingerprint) DO UPDATE SET expires_at=EXCLUDED.expires_at,claimed_at=now() WHERE ${table('replay_claims')}.expires_at<=now() RETURNING fingerprint`,[fingerprint,duration(ttlSeconds)]);return Boolean(result.rows[0]);},async purge(){return(await pool.query(`DELETE FROM ${table('replay_claims')} WHERE expires_at<=now()`)).rowCount;}});
  const outbox=Object.freeze({
    async append(event){const result=await pool.query(`INSERT INTO ${table('downstream_outbox')} (event_id,event,state) VALUES ($1,$2,'pending') ON CONFLICT DO NOTHING RETURNING *`,[event.event_id,event]);return clone(result.rows[0]||(await pool.query(`SELECT * FROM ${table('downstream_outbox')} WHERE event_id=$1`,[event.event_id])).rows[0]);},
    async leasePending(limit=100,{leaseMs:requested=defaultLease}={}){return transaction(pool,async client=>{const result=await client.query(`WITH candidates AS (SELECT event_id FROM ${table('downstream_outbox')} WHERE (state='pending' AND available_at<=now()) OR (state='leased' AND lease_expires_at<=now()) ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE ${table('downstream_outbox')} item SET state='leased',lease_expires_at=now()+$2*interval '1 millisecond',updated_at=now() FROM candidates WHERE item.event_id=candidates.event_id RETURNING item.*`,[Math.max(1,Math.min(1000,limit)),duration(requested)]);return result.rows.map(row=>({id:row.event_id,event:clone(row.event),state:row.state,attempts:row.attempts}));});},
    async pending(limit=100){return(await pool.query(`SELECT * FROM ${table('downstream_outbox')} WHERE state='pending' AND available_at<=now() ORDER BY available_at,created_at LIMIT $1`,[limit])).rows.map(row=>({id:row.event_id,event:clone(row.event),state:row.state,attempts:row.attempts}));},
    async attempted(id,error){await pool.query(`UPDATE ${table('downstream_outbox')} SET attempts=attempts+1,last_error=$2,updated_at=now() WHERE event_id=$1`,[id,error?String(error.message||error):null]);},async delivered(id){await pool.query(`UPDATE ${table('downstream_outbox')} SET state='delivered',lease_expires_at=NULL,updated_at=now() WHERE event_id=$1`,[id]);},async retry(id,{delayMs=1000}={}){await pool.query(`UPDATE ${table('downstream_outbox')} SET state='pending',available_at=now()+$2*interval '1 millisecond',lease_expires_at=NULL,updated_at=now() WHERE event_id=$1`,[id,Math.max(0,Number(delayMs)||0)]);},async deadLettered(id){await pool.query(`UPDATE ${table('downstream_outbox')} SET state='dead_lettered',lease_expires_at=NULL,updated_at=now() WHERE event_id=$1`,[id]);},async list(){return(await pool.query(`SELECT * FROM ${table('downstream_outbox')} ORDER BY created_at`)).rows.map(row=>({id:row.event_id,event:clone(row.event),state:row.state,attempts:row.attempts,last_error:row.last_error}));}
  });
  const consumerStore=Object.freeze({async accept({fingerprint,event}){const result=await pool.query(`INSERT INTO ${table('consumed_downstream_events')} (event_id,signature_fingerprint,event) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id`,[event.event_id,fingerprint,event]);return{accepted:Boolean(result.rows[0]),duplicate:!result.rows[0]};},async list(limit=100){return(await pool.query(`SELECT event FROM ${table('consumed_downstream_events')} ORDER BY consumed_at DESC LIMIT $1`,[Math.max(1,Math.min(1000,limit))])).rows.map(row=>clone(row.event));}});
  const audit=async record=>{await pool.query(`INSERT INTO ${table('operator_audit')} (record,occurred_at) VALUES ($1,$2)`,[record,record.occurred_at||new Date()]);};
  return Object.freeze({migrate:()=>pool.query(postgresMigrationSql({schema:s})),revisionStore,operationStore,receiptStore,queue,ingress,deadLetters,reconciliationStore,replayStore,outbox,consumerStore,audit});
}
