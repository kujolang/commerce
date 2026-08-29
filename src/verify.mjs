import { providerFor } from './providers.mjs';

const redact=value=>String(value||'').replace(/(sk_(?:live|test)_[A-Za-z0-9]+|polar_[A-Za-z0-9_-]+|pdl_[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+)/g,'[redacted]');

export async function verifyRemote(config,products,env=process.env,request=fetch){
  const providerId=String(config.provider||'mock'),adapter=providerFor(providerId),providerConfig=config.providers?.[providerId]||{},results=[];
  for(const product of products){
    try{results.push(await adapter.verifyRemote(product,providerConfig,env,{fetch:request,timeoutMs:config.runtime?.timeout_ms||10000}));}
    catch(error){results.push({sku:product.sku,source:product.source,status:'error',message:redact(error.message||error),provider_request_id:error.requestId||undefined});}
  }
  return results;
}
