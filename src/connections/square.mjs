import {boundedBody,squareRequest} from '../providers/square/client.mjs';
import {hashState} from './vault.mjs';
import {assertStableId} from '../contracts.mjs';
import {fail} from '../payments/model.mjs';

export const squareScopes=features=>{
  const scopes=new Set(['MERCHANT_PROFILE_READ']);
  const modules={terminal:['PAYMENTS_READ','PAYMENTS_WRITE','DEVICE_CREDENTIAL_MANAGEMENT'],reporting:['DISPUTES_READ','PAYOUTS_READ'],fees:['PAYMENTS_READ','PAYMENTS_WRITE','ORDERS_READ','ORDERS_WRITE','PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS'],payments:['PAYMENTS_READ','PAYMENTS_WRITE'],hosted:['ORDERS_READ','ORDERS_WRITE','PAYMENTS_READ','PAYMENTS_WRITE'],cards:['CUSTOMERS_READ','CUSTOMERS_WRITE','PAYMENTS_READ','PAYMENTS_WRITE'],subscriptions:['ITEMS_READ','SUBSCRIPTIONS_READ','SUBSCRIPTIONS_WRITE','CUSTOMERS_READ','CUSTOMERS_WRITE','PAYMENTS_READ','PAYMENTS_WRITE'],invoices:['INVOICES_READ','INVOICES_WRITE','ORDERS_READ','ORDERS_WRITE','CUSTOMERS_READ'],catalog:['ITEMS_READ','ITEMS_WRITE'],inventory:['INVENTORY_READ','INVENTORY_WRITE']};
  for(const feature of features){if(!Object.hasOwn(modules,feature))throw fail('unsupported_connection_feature');for(const permission of modules[feature])scopes.add(permission);}return [...scopes].sort();
};
export const connectionKey=({merchant_id,connection_id,environment})=>{assertStableId(merchant_id);assertStableId(connection_id);if(!['sandbox','production'].includes(environment))throw fail('invalid_environment');return JSON.stringify([merchant_id,connection_id,environment]);};
const publicConnection=record=>record&&({merchant_id:record.merchant_id,connection_id:record.connection_id,environment:record.environment,provider_merchant_id:record.provider_merchant_id,state:record.state,location_id:record.location_id||null,expires_at:record.expires_at,generation:record.generation,scopes:record.scopes});

export function createSquareConnections({store,vault,applicationId,applicationSecret,redirectUri,environment='sandbox',features=['payments'],fetch:request=globalThis.fetch,now=Date.now}={}){
  if(!store||!vault||!applicationId||!applicationSecret||!['sandbox','production'].includes(environment))throw fail('connection_configuration_required');
  const redirect=new URL(redirectUri);if(redirect.protocol!=='https:'&&!(environment==='sandbox'&&redirect.protocol==='http:'&&['localhost','127.0.0.1'].includes(redirect.hostname)))throw fail('secure_redirect_required');
  const base=environment==='sandbox'?'https://connect.squareupsandbox.com':'https://connect.squareup.com',scopes=squareScopes(features);
  const call=async(path,body,authorization)=>{
    const controller=new AbortController();let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(fail('connection_outcome_unknown'));},10000);});
    try{return await Promise.race([timeout,(async()=>{const response=await request(base+path,{method:'POST',redirect:'error',signal:controller.signal,headers:{'content-type':'application/json',...(authorization?{authorization}:{})},body:JSON.stringify(body)});const raw=await boundedBody(response,65536);if(!response.ok)throw fail('connection_provider_error');return raw?JSON.parse(raw):{};})()]);}catch{throw fail('connection_outcome_unknown');}finally{clearTimeout(timer);}
  };
  const issueTokens=async(body)=>{
    const tokens=await call('/oauth2/token',{client_id:applicationId,client_secret:applicationSecret,...body});
    if(!tokens.access_token||!tokens.refresh_token||!tokens.merchant_id||!Number.isFinite(Date.parse(tokens.expires_at))||Date.parse(tokens.expires_at)<=now())throw fail('invalid_connection_tokens');
    const status=await call('/oauth2/token/status',{},`Bearer ${tokens.access_token}`);
    if(status.merchant_id!==tokens.merchant_id||scopes.some(scope=>!status.scopes?.includes(scope)))throw fail('connection_scope_missing');
    return tokens;
  };
  const credentialData=tokens=>({access_token:tokens.access_token,refresh_token:tokens.refresh_token});
  const api={
    async authorize({merchant_id,connection_id,actor}){
      if(!actor)throw fail('connection_admin_required');const binding={merchant_id,connection_id,environment},id=connectionKey(binding),state=crypto.randomUUID()+crypto.randomUUID();
      const current=await store.get(id);if(current&&['refreshing','disconnecting','revocation_unknown'].includes(current.state))throw fail('connection_busy');await store.putState(await hashState(state),{...binding,actor,expires_at:now()+10*60*1000,generation:current?.generation||0});
      const url=new URL('/oauth2/authorize',base);for(const [key,value] of Object.entries({client_id:applicationId,scope:scopes.join(' '),state,redirect_uri:redirectUri}))url.searchParams.set(key,value);
      return {authorization_url:url.toString()};
    },
    async callback({state,code,error,actor,merchant_id}){
      if(typeof state!=='string'||state.length>512||!actor)throw fail('invalid_oauth_state');
      const binding=await store.consumeState(await hashState(state),actor),id=connectionKey(binding);
      if(merchant_id&&binding.merchant_id!==merchant_id)throw fail('invalid_oauth_state');
      if(error||typeof code!=='string'||!code||code.length>4096)throw fail('oauth_denied');
      const tokens=await issueTokens({grant_type:'authorization_code',code,redirect_uri:redirectUri}),credentials=await vault.seal(credentialData(tokens),id);
      return store.transact(id,tx=>{
        if((tx.record?.generation||0)!==binding.generation)throw fail('connection_changed');
        if(tx.record?.provider_merchant_id&&tx.record.provider_merchant_id!==tokens.merchant_id)throw fail('connection_merchant_mismatch');
        tx.record={...binding,provider_merchant_id:tokens.merchant_id,location_id:tx.record?.location_id||null,state:'active',credentials,expires_at:tokens.expires_at,refreshed_at:now(),generation:binding.generation+1,scopes};delete tx.record.actor;
        return publicConnection(tx.record);
      });
    },
    async credentials(binding){const id=connectionKey({...binding,environment}),record=await store.get(id);if(record?.state!=='active'||!Number.isFinite(Date.parse(record.expires_at))||Date.parse(record.expires_at)<=now()+60000)throw fail('connection_unavailable');const tokens=await vault.open(record.credentials,id);return {connection:publicConnection(record),access_token:tokens.access_token};},
    async refresh(binding){
      const id=connectionKey({...binding,environment}),claim=await store.transact(id,tx=>{
        if(tx.record?.state!=='active')throw fail('connection_unavailable');
        const token=crypto.randomUUID();tx.record.state='refreshing';tx.record.refresh_claim=token;tx.record.refresh_started_at=now();tx.record.generation++;return {record:structuredClone(tx.record),token};
      });
      try{
        const old=await vault.open(claim.record.credentials,id),tokens=await issueTokens({grant_type:'refresh_token',refresh_token:old.refresh_token});
        if(tokens.merchant_id!==claim.record.provider_merchant_id)throw fail('connection_merchant_mismatch');
        const credentials=await vault.seal(credentialData(tokens),id);
        return await store.transact(id,tx=>{if(tx.record?.refresh_claim!==claim.token||tx.record.generation!==claim.record.generation)throw fail('connection_changed');Object.assign(tx.record,{credentials,state:'active',expires_at:tokens.expires_at,refreshed_at:now()});delete tx.record.refresh_claim;return publicConnection(tx.record);});
      }catch(error){await store.transact(id,tx=>{if(tx.record?.refresh_claim===claim.token){tx.record.state='reconnect_required';delete tx.record.refresh_claim;}});throw error;}
    },
    async recoverRefresh(binding){return store.transact(connectionKey({...binding,environment}),tx=>{if(tx.record?.state!=='refreshing'||now()-tx.record.refresh_started_at<30000)throw fail('connection_busy');tx.record.state='reconnect_required';tx.record.generation++;delete tx.record.refresh_claim;return publicConnection(tx.record);});},
    async status(binding){const value=await store.get(connectionKey({...binding,environment}));return {...publicConnection(value),refresh_due:Boolean(value&&now()-value.refreshed_at>=7*86400000)};},
    async locations(binding){const {access_token}=await api.credentials(binding);const response=await squareRequest('/v2/locations',{}, {api_base:base},{SQUARE_ACCESS_TOKEN:access_token},{fetch:request});const raw=await boundedBody(response);return (JSON.parse(raw).locations||[]).map(location=>({id:location.id,name:location.name,status:location.status,currency:location.currency,country:location.country,capabilities:location.capabilities||[]}));},
    async selectLocation(binding,locationId){const before=await api.status(binding),locations=await api.locations(binding),location=locations.find(value=>value.id===locationId&&value.status==='ACTIVE');if(!location)throw fail('invalid_location');return store.transact(connectionKey({...binding,environment}),tx=>{if(tx.record?.state!=='active')throw fail('connection_unavailable');if(tx.record.generation!==before.generation)throw fail('connection_changed');tx.record.location_id=locationId;tx.record.generation++;return publicConnection(tx.record);});},
    async revoke(binding){
      const id=connectionKey({...binding,environment}),record=await store.transact(id,tx=>{if(!tx.record)throw fail('connection_not_found');tx.record.state='disconnecting';tx.record.generation++;return structuredClone(tx.record);});
      try{const tokens=record.credentials?await vault.open(record.credentials,id):null;if(tokens)await call('/oauth2/revoke',{client_id:applicationId,access_token:tokens.access_token,revoke_only_access_token:false},`Client ${applicationSecret}`);
        return await store.transact(id,tx=>{if(tx.record.generation!==record.generation)throw fail('connection_changed');tx.record.state='disconnected';delete tx.record.credentials;return publicConnection(tx.record);});
      }catch(error){await store.transact(id,tx=>{if(tx.record.generation===record.generation)tx.record.state='revocation_unknown';});throw error;}
    },
    async markRevoked(binding,providerMerchantId){return store.transact(connectionKey({...binding,environment}),tx=>{if(!tx.record||tx.record.provider_merchant_id!==providerMerchantId)throw fail('connection_merchant_mismatch');tx.record.state='revoked';tx.record.generation++;delete tx.record.credentials;delete tx.record.refresh_claim;return publicConnection(tx.record);});}
  };
  return Object.freeze(api);
}
