import {fetchWithPolicy,providerError} from '../../provider-utils.mjs';

export const SQUARE_VERSION='2026-09-16';
export const squareBase=config=>config.api_base||'https://connect.squareupsandbox.com';
export const squareHeaders=(token,config)=>({authorization:`Bearer ${token}`,'content-type':'application/json','square-version':config.api_version||SQUARE_VERSION});
export const squareToken=(config,env)=>{const token=env[config.access_token_env||'SQUARE_ACCESS_TOKEN'];if(!token)throw new Error('Square access token is not configured');return token;};
export const squareRequest=async(path,options,config,env,context)=>{const response=await fetchWithPolicy(`${squareBase(config)}${path}`,{...options,headers:{...squareHeaders(squareToken(config,env),config),...(options?.headers||{})}},context);if(!response.ok)throw providerError(response,`Square request failed (${response.status})`);return response;};
// Keys are final provider keys, never identities to sanitize or truncate. Legacy
// lossy inputs must be reconciled and supplied as their original materialized key.
export const requiredOperationKey=value=>{
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,45}$/.test(value))throw new Error('Square mutation requires a persisted semantic idempotency key (1-45 safe characters)');
  return value;
};
