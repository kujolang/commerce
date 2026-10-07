import test from 'node:test';
import assert from 'node:assert/strict';
import {createTokenVault,createMemoryConnectionStore,createSquareConnections,connectionKey} from '../src/connections/index.mjs';
const binding={merchant_id:'merchant',connection_id:'square',environment:'sandbox'};
function setup(){
  const store=createMemoryConnectionStore(),vault=createTokenVault({keys:{test:new Uint8Array(32).fill(9)},activeKeyId:'test'}),calls=[];let seller='seller',pause;
  const fetch=async(url,options)=>{calls.push({url,options});if(url.endsWith('/oauth2/token')){if(pause)await pause;return Response.json({access_token:'private-access-token',refresh_token:'private-refresh-token',merchant_id:seller,expires_at:'2099-01-01T00:00:00Z'});}if(url.endsWith('/oauth2/token/status'))return Response.json({merchant_id:seller,scopes:['MERCHANT_PROFILE_READ','PAYMENTS_READ','PAYMENTS_WRITE']});if(url.endsWith('/v2/locations'))return Response.json({locations:[{id:'LOCATION',status:'ACTIVE',currency:'USD'}]});if(url.endsWith('/oauth2/revoke'))return Response.json({success:true});throw new Error('unexpected fixture');};
  const api=createSquareConnections({store,vault,applicationId:'app',applicationSecret:'private-app-secret',redirectUri:'https://site.test/callback',fetch});
  return {store,vault,calls,api,setSeller:value=>{seller=value;},pause:value=>{pause=value;}};
}
async function connect(api){const {authorization_url}=await api.authorize({...binding,actor:'admin'}),state=new URL(authorization_url).searchParams.get('state');return api.callback({state,code:'transient-code',actor:'admin',merchant_id:'merchant'});}

test('OAuth state is actor-bound, one-use and tokens are encrypted with scope AAD',async()=>{
  const {store,api,vault,calls}=setup(),start=await api.authorize({...binding,actor:'admin'}),state=new URL(start.authorization_url).searchParams.get('state');
  assert.ok(!start.authorization_url.includes('secret'));await assert.rejects(()=>api.callback({state,code:'code',actor:'other'}),/invalid_oauth_state/);assert.equal(calls.length,0);
  const connected=await api.callback({state,code:'code',actor:'admin'});assert.equal(connected.provider_merchant_id,'seller');assert.ok(!JSON.stringify(connected).includes('token'));
  await assert.rejects(()=>api.callback({state,code:'code',actor:'admin'}),/invalid_oauth_state/);
  const record=await store.get(connectionKey(binding)),serialized=JSON.stringify(record);assert.ok(!serialized.includes('private-'));assert.ok(!serialized.includes('transient-code'));
  await assert.rejects(()=>vault.open(record.credentials,'different merchant'));
  assert.equal((await api.credentials(binding)).access_token,'private-access-token');assert.equal((await api.credentials(binding)).refresh_token,undefined);
});
test('refresh serializes competitors, reconnect refuses another seller, disconnect blocks credentials',async()=>{
  const {api,pause,setSeller,calls}=setup();await connect(api);let release;pause(new Promise(resolve=>{release=resolve;}));
  const first=api.refresh(binding);await new Promise(resolve=>setImmediate(resolve));await assert.rejects(()=>api.refresh(binding),/unavailable/);release();await first;pause(null);
  assert.equal(calls.filter(call=>call.url.endsWith('/oauth2/token')&&JSON.parse(call.options.body).grant_type==='refresh_token').length,1);
  await api.selectLocation(binding,'LOCATION');assert.equal((await api.status(binding)).location_id,'LOCATION');
  setSeller('different');await assert.rejects(()=>connect(api),/merchant_mismatch/);setSeller('seller');
  await api.revoke(binding);assert.equal((await api.status(binding)).state,'disconnected');await assert.rejects(()=>api.credentials(binding),/unavailable/);
});
test('scope requirements reject unsupported fee permissions and production HTTP callbacks',()=>{
  const {store,vault}=setup();assert.throws(()=>createSquareConnections({store,vault,applicationId:'app',applicationSecret:'secret',redirectUri:'http://example.test/callback',environment:'production'}),/secure_redirect/);
});

test('connected payment service cannot use a cached token after disconnect',async()=>{
  const {createConnectedPaymentService}=await import('../src/connections/payment-service.mjs');
  const {createMemoryPaymentStore}=await import('../src/payments/index.mjs');
  const {providerFor}=await import('../src/providers.mjs');const {input}=await import('./fixtures/owned-payments.mjs');
  const {api}=setup();await connect(api);await api.selectLocation(binding,'LOCATION');let calls=0;
  const service=await createConnectedPaymentService({connections:api,binding,store:createMemoryPaymentStore(),provider:providerFor('square'),context:{fetch:async()=>{calls++;throw Error('unexpected request');}}});
  await service.create(input);await api.revoke(binding);
  await assert.rejects(()=>service.pay({orderId:'order',attemptId:'attempt',sourceToken:'source'}),/connection_unavailable/);assert.equal(calls,0);
});
