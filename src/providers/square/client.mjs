export const SQUARE_VERSION='2026-09-16';
const ORIGINS=new Set(['https://connect.squareupsandbox.com','https://connect.squareup.com']);
export const squareBase=config=>{
  const value=String(config.api_base||'https://connect.squareupsandbox.com').replace(/\/$/,'');
  if(!ORIGINS.has(value))throw Object.assign(new Error('Square requires an official API origin'),{code:'configuration'});
  if(config.api_version&&config.api_version!==SQUARE_VERSION)throw Object.assign(new Error('Unsupported Square API version'),{code:'configuration'});
  return value;
};
export const squareHeaders=(token,config)=>({authorization:`Bearer ${token}`,'content-type':'application/json','square-version':config.api_version||SQUARE_VERSION});
export const squareToken=(config,env)=>{const token=env[config.access_token_env||'SQUARE_ACCESS_TOKEN'];if(!token)throw Object.assign(new Error('Square access token is not configured'),{code:'configuration'});return token;};
export const requiredOperationKey=value=>{
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,45}$/.test(value))throw new Error('Square mutation requires a persisted semantic idempotency key (1-45 safe characters)');
  return value;
};
export async function boundedBody(response,maxBytes=1048576){
  if(Number(response.headers.get('content-length'))>maxBytes)throw new Error('Square response too large');
  if(!response.body)return '';
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw new Error('Square response too large');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(bytes);
}
const declineCodes=new Set(['CARD_DECLINED','GENERIC_DECLINE','INSUFFICIENT_FUNDS','CVV_FAILURE','ADDRESS_VERIFICATION_FAILURE','CARD_EXPIRED','INVALID_CARD']);
export async function squareRequest(path,options={},config={},env={},context={}){
  const base=squareBase(config);if(!path.startsWith('/v2/')||path.includes('\\'))throw new Error('Invalid Square API path');
  const token=context.resolveToken?await context.resolveToken({location_id:config.location_id,api_base:base}):squareToken(config,env);if(typeof token!=='string'||!token)throw new Error('Square access token is not configured');const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(new Error('Square request outcome is unknown'),{code:'timeout',definitive:false}));},Math.max(100,Math.min(30000,context.timeoutMs||10000)));});
  try{return await Promise.race([timeout,(async()=>{
    let response;
    try{response=await (context.fetch||globalThis.fetch)(`${base}${path}`,{...options,redirect:'error',signal:controller.signal,headers:{...squareHeaders(token,config)}});}
    catch{throw Object.assign(new Error('Square request outcome is unknown'),{code:'provider_unavailable',definitive:false});}
    const raw=await boundedBody(response),requestId=response.headers.get('x-request-id')||response.headers.get('x-square-request-id')||undefined;
    if(!response.ok){
      let codes=[];try{codes=JSON.parse(raw).errors?.map(error=>error.code)||[];}catch{}
      const declined=codes.some(code=>declineCodes.has(code));
      const code=declined?'card_declined':codes.includes('VERSION_MISMATCH')?'version_conflict':codes.includes('IDEMPOTENCY_KEY_REUSED')?'idempotency_conflict':response.status===401?'authentication':response.status===403?'authorization':response.status===429?'rate_limited':response.status>=500?'provider_unavailable':'invalid_request';
      throw Object.assign(new Error(`Square request failed: ${code}`),{code,status:response.status,requestId,definitive:declined||code==='version_conflict'});
    }
    return new Response(raw||null,{status:response.status,headers:response.headers});
  })()]);}finally{clearTimeout(timer);}
}
export async function squareJson(path,body,config,env,context,method='POST'){
  const response=await squareRequest(path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})},config,env,context);
  const value=await response.json();return {...value,provider_request_id:response.headers.get('x-request-id')||response.headers.get('x-square-request-id')||undefined};
}
export function query(input){const params=new URLSearchParams();for(const [key,value] of Object.entries(input||{}))if(value!==undefined&&value!==null)params.set(key,String(value));const encoded=params.toString();return encoded?`?${encoded}`:'';}
