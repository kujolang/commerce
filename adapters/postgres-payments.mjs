import {scopeKey,fail} from '../src/payments/model.mjs';

const schemaName=value=>{if(!/^[a-z_][a-z0-9_]{0,62}$/.test(value))throw new Error('invalid PostgreSQL schema');return value;};
export function paymentMigrationSql({schema='commerce'}={}){
  const s=schemaName(schema);
  // Additive opt-in tables. Legacy v1 rows have no trustworthy tenant scope and
  // are deliberately not copied, reset, or assigned new provider keys.
  return `CREATE SCHEMA IF NOT EXISTS ${s};
CREATE TABLE IF NOT EXISTS ${s}.owned_orders (
 scope text NOT NULL, id text NOT NULL, document jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(scope,id));
CREATE TABLE IF NOT EXISTS ${s}.owned_inbox (
 scope text NOT NULL, id text NOT NULL, event jsonb NOT NULL,
 state text NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','leased','processed','dead')),
 token text, generation integer NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 PRIMARY KEY(scope,id));
CREATE INDEX IF NOT EXISTS owned_inbox_ready ON ${s}.owned_inbox(scope,state,available_at);
CREATE TABLE IF NOT EXISTS ${s}.owned_outbox (
 scope text NOT NULL, event_id text NOT NULL, event jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','delivered')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(scope,event_id));`;
}
export function createPostgresPaymentStore({pool,schema='commerce'}={}){
  const s=schemaName(schema);if(!pool?.connect)throw new Error('PostgreSQL pool required');
  const transaction=async work=>{const client=await pool.connect();try{await client.query('BEGIN');const value=await work(client);await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}};
  const receiptRow=row=>row&&({id:row.id,event:row.event,token:row.token,generation:row.generation,attempts:row.attempts,state:row.state});
  return Object.freeze({
    migrate:()=>pool.query(paymentMigrationSql({schema:s})),
    async transact(scope,id,work){const partition=scopeKey(scope);return transaction(async client=>{
      // Locks nonexistent and existing orders alike. Hash collisions only cause
      // extra serialization; all reads/writes still compare exact scope and id.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([partition,id])]);
      const row=(await client.query(`SELECT document FROM ${s}.owned_orders WHERE scope=$1 AND id=$2 FOR UPDATE`,[partition,id])).rows[0];
      const tx={order:row?.document||null,put:value=>{tx.order=value;},emit:async event=>{await client.query(`INSERT INTO ${s}.owned_outbox(scope,event_id,event) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[partition,event.event_id,event]);},complete:async receipt=>{
        const result=await client.query(`UPDATE ${s}.owned_inbox SET state='processed' WHERE scope=$1 AND id=$2 AND token=$3 AND generation=$4 AND state='leased' RETURNING id`,[partition,receipt.id,receipt.token,receipt.generation]);if(!result.rowCount)throw fail('stale_receipt');
      }};
      const result=await work(tx);
      if(tx.order)await client.query(`INSERT INTO ${s}.owned_orders(scope,id,document) VALUES($1,$2,$3) ON CONFLICT(scope,id) DO UPDATE SET document=EXCLUDED.document,updated_at=now()`,[partition,id,tx.order]);
      return result;
    });},
    async get(scope,id){return (await pool.query(`SELECT document FROM ${s}.owned_orders WHERE scope=$1 AND id=$2`,[scopeKey(scope),id])).rows[0]?.document||null;},
    async list(scope,{limit=100}={}){return (await pool.query(`SELECT document FROM ${s}.owned_orders WHERE scope=$1 ORDER BY id LIMIT $2`,[scopeKey(scope),Math.min(1000,Math.max(1,limit))])).rows.map(row=>row.document);},
    async ingest(scope,event){const result=await pool.query(`INSERT INTO ${s}.owned_inbox(scope,id,event) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`,[scopeKey(scope),event.id,event]);return {duplicate:!result.rowCount};},
    async lease(scope,{leaseMs=30000}={}){return transaction(async client=>{const result=await client.query(`WITH candidate AS (SELECT id FROM ${s}.owned_inbox WHERE scope=$1 AND ((state='ready' AND available_at<=now()) OR (state='leased' AND lease_until<=now())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE ${s}.owned_inbox job SET state='leased',token=$2,generation=generation+1,attempts=attempts+1,lease_until=now()+$3*interval '1 millisecond' FROM candidate WHERE job.scope=$1 AND job.id=candidate.id RETURNING job.*`,[scopeKey(scope),crypto.randomUUID(),Math.max(1,leaseMs)]);return receiptRow(result.rows[0])||null;});},
    async retry(scope,receipt,{maxAttempts=5,delayMs=1000}={}){const result=await pool.query(`UPDATE ${s}.owned_inbox SET state=CASE WHEN attempts >= $5 THEN 'dead' ELSE 'ready' END,available_at=now()+$6*interval '1 millisecond' WHERE scope=$1 AND id=$2 AND token=$3 AND generation=$4 AND state='leased' RETURNING id`,[scopeKey(scope),receipt.id,receipt.token,receipt.generation,maxAttempts,Math.max(0,delayMs)]);if(!result.rowCount)throw fail('stale_receipt');},
    async inbox(scope){return (await pool.query(`SELECT * FROM ${s}.owned_inbox WHERE scope=$1 ORDER BY id`,[scopeKey(scope)])).rows.map(receiptRow);},
    async outbox(scope){return (await pool.query(`SELECT event,state FROM ${s}.owned_outbox WHERE scope=$1 ORDER BY created_at,event_id`,[scopeKey(scope)])).rows;},
    async delivered(scope,id){await pool.query(`UPDATE ${s}.owned_outbox SET state='delivered' WHERE scope=$1 AND event_id=$2`,[scopeKey(scope),id]);}
  });
}
