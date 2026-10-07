import {fail} from '../src/payments/model.mjs';
export function createPostgresConnectionStore({pool,schema='commerce'}={}){
  if(!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)||!pool?.connect)throw new Error('Valid schema and pool required');const s=schema;
  const transaction=async work=>{const client=await pool.connect();try{await client.query('BEGIN');const value=await work(client);await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}};
  return Object.freeze({
    migrate:()=>pool.query(`CREATE SCHEMA IF NOT EXISTS ${s}; CREATE TABLE IF NOT EXISTS ${s}.provider_connections(id text PRIMARY KEY,document jsonb NOT NULL); CREATE TABLE IF NOT EXISTS ${s}.connection_states(hash text PRIMARY KEY,actor text NOT NULL,expires_at timestamptz NOT NULL,consumed boolean NOT NULL DEFAULT false,document jsonb NOT NULL);`),
    async transact(id,work){return transaction(async client=>{await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[id]);const row=(await client.query(`SELECT document FROM ${s}.provider_connections WHERE id=$1 FOR UPDATE`,[id])).rows[0],tx={record:row?.document||null};const result=await work(tx);if(tx.record)await client.query(`INSERT INTO ${s}.provider_connections(id,document) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET document=EXCLUDED.document`,[id,tx.record]);return result;});},
    async get(id){return (await pool.query(`SELECT document FROM ${s}.provider_connections WHERE id=$1`,[id])).rows[0]?.document||null;},
    async putState(hash,record){await pool.query(`INSERT INTO ${s}.connection_states(hash,actor,expires_at,document) VALUES($1,$2,$3,$4)`,[hash,record.actor,new Date(record.expires_at),record]);},
    async consumeState(hash,actor){const result=await pool.query(`UPDATE ${s}.connection_states SET consumed=true WHERE hash=$1 AND actor=$2 AND expires_at>now() AND consumed=false RETURNING document`,[hash,actor]);if(!result.rowCount)throw fail('invalid_oauth_state');return result.rows[0].document;}
  });
}
