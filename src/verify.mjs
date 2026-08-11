const amountFromDisplay=value=>{const match=String(value||'').replace(/,/g,'').match(/\d+(?:\.\d{1,2})?/);return match?Math.round(Number(match[0])*100):null};
const result=(product,status,message)=>({sku:product.sku,source:product.source,status,message});

export async function verifyRemote(config,products,env=process.env,request=fetch){
  const provider=String(config.provider||'mock'),providerConfig=config.providers?.[provider]||{},results=[];
  if(provider==='mock')return products.map(product=>result(product,'ok','Mock provider is local and deterministic.'));
  for(const product of products){
    try{
      const settings=product.providers?.[provider]||{};
      if(provider==='link'){
        const response=await request(settings.url,{method:'HEAD',redirect:'manual'});
        results.push(result(product,response.ok||[301,302,303,307,308].includes(response.status)?'ok':'error',`Hosted link returned HTTP ${response.status}.`));continue;
      }
      if(provider==='stripe'){
        const key=env[providerConfig.secret_key_env||'STRIPE_SECRET_KEY'];if(!key)throw Error(`Missing environment variable ${providerConfig.secret_key_env||'STRIPE_SECRET_KEY'}`);
        const response=await request(`https://api.stripe.com/v1/prices/${encodeURIComponent(settings.price_id)}?expand[]=product`,{headers:{authorization:`Basic ${btoa(`${key}:`)}`}});if(!response.ok)throw Error(`Stripe returned HTTP ${response.status}`);const price=await response.json();if(price.active===false||price.product?.active===false){results.push(result(product,'error','Stripe Price or Product is inactive.'));continue}const expected=amountFromDisplay(product.price_display),warnings=[];if(price.currency&&String(price.currency).toUpperCase()!==product.currency)warnings.push(`currency is ${String(price.currency).toUpperCase()}, configured ${product.currency}`);if(Number.isInteger(price.unit_amount)&&expected!==null&&price.unit_amount!==expected)warnings.push(`amount is ${price.unit_amount}, display implies ${expected} minor units`);results.push(result(product,warnings.length?'warning':'ok',warnings.length?`Stripe verification warning: ${warnings.join('; ')}.`:'Stripe Price and Product are active.'));continue;
      }
      if(provider==='polar'){
        const token=env[providerConfig.access_token_env||'POLAR_ACCESS_TOKEN'];if(!token)throw Error(`Missing environment variable ${providerConfig.access_token_env||'POLAR_ACCESS_TOKEN'}`);const response=await request(`${providerConfig.api_base||'https://api.polar.sh/v1'}/products/${encodeURIComponent(settings.product_id)}`,{headers:{authorization:`Bearer ${token}`}});if(!response.ok)throw Error(`Polar returned HTTP ${response.status}`);const remote=await response.json();if(remote.is_archived){results.push(result(product,'error','Polar Product is archived.'));continue}const currencies=(remote.prices||[]).map(price=>String(price.price_currency||price.currency||'').toUpperCase()).filter(Boolean);const warning=currencies.length&&!currencies.includes(product.currency);results.push(result(product,warning?'warning':'ok',warning?`Polar currencies ${currencies.join(', ')} do not include ${product.currency}.`:'Polar Product is active.'));continue;
      }
      results.push(result(product,'error',`Unknown provider ${provider}.`));
    }catch(error){results.push(result(product,'error',String(error.message||error).replace(/(sk_(?:live|test)_[A-Za-z0-9]+|polar_[A-Za-z0-9_-]+)/g,'[redacted]')))}
  }
  return results;
}
