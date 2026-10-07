import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createPostgresConnectionStore} from '../adapters/postgres-connections.mjs';
import {createTokenVault,createSquareConnections,connectionKey} from '../src/connections/index.mjs';
const connectionString=process.env.COMMERCE_POSTGRES_URL;

test('PostgreSQL OAuth state consumption, encrypted reload and refresh concurrency',{skip:!connectionString},async()=>{
  let pool=new pg.Pool({connectionString,max:6});const schema=`connection_test_${process.pid}_${Date.now()}`,binding={merchant_id:'merchant',connection_id:'connection',environment:'sandbox'};
  const vault=createTokenVault({keys:{fixture:new Uint8Array(32).fill(11)},activeKeyId:'fixture'});let refreshCalls=0;
  const fetch=async(url,options)=>{if(url.endsWith('/token/status'))return Response.json({merchant_id:'seller',scopes:['MERCHANT_PROFILE_READ','PAYMENTS_READ','PAYMENTS_WRITE']});if(JSON.parse(options.body).grant_type==='refresh_token'){refreshCalls++;await new Promise(resolve=>setTimeout(resolve,30));}return Response.json({merchant_id:'seller',access_token:'plaintext-access',refresh_token:'plaintext-refresh',expires_at:'2099-01-01T00:00:00Z'});};
  const api=store=>createSquareConnections({store,vault,applicationId:'app',applicationSecret:'secret-fixture',redirectUri:'https://site.test/callback',fetch});
  try{
    let store=createPostgresConnectionStore({pool,schema});await store.migrate();await store.migrate();
    let connections=api(store);const url=new URL((await connections.authorize({...binding,actor:'admin'})).authorization_url),state=url.searchParams.get('state');
    const callbacks=await Promise.allSettled(Array.from({length:8},()=>connections.callback({state,code:'one-use-code',actor:'admin'})));assert.equal(callbacks.filter(value=>value.status==='fulfilled').length,1);
    const raw=JSON.stringify((await pool.query(`SELECT * FROM ${schema}.provider_connections`)).rows);assert.ok(!raw.includes('plaintext-'));assert.ok(!raw.includes('one-use-code'));
    await pool.end();pool=new pg.Pool({connectionString,max:6});store=createPostgresConnectionStore({pool,schema});connections=api(store);
    assert.equal((await connections.credentials(binding)).access_token,'plaintext-access');
    const refreshed=await Promise.allSettled(Array.from({length:8},()=>connections.refresh(binding)));assert.equal(refreshed.filter(value=>value.status==='fulfilled').length,1);assert.equal(refreshCalls,1);
    assert.equal((await store.get(connectionKey(binding))).generation,2);
    assert.equal(await store.get(connectionKey({...binding,merchant_id:'other'})),null);
    await connections.markRevoked(binding,'seller');await assert.rejects(()=>connections.credentials(binding),/unavailable/);
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
