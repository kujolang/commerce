import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import YAML from 'yaml';
import { loadConfig } from './config.mjs';
import { formatMoney, moneyDecimal, normalizeMoney, validateMoney } from './money.mjs';
import { providerFor } from './providers.mjs';
import { safeUrl } from './provider-utils.mjs';

const TYPES=new Set(['digital','physical','service','subscription']);
const SKU=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PRODUCT_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const projectPath=(root,value,label)=>{const base=path.resolve(root),target=path.resolve(base,String(value));if(target!==base&&!target.startsWith(`${base}${path.sep}`))throw new Error(`${label} must stay within the site root.`);return target;};

function frontmatter(text,file){const match=text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);if(!match)return{meta:{},body:text,raw:''};try{return{meta:YAML.parse(match[1])||{},body:text.slice(match[0].length),raw:match[1]};}catch(error){throw new Error(`${file}: malformed frontmatter: ${error.message}`);}}
async function filesUnder(root){const out=[];async function visit(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const target=path.join(dir,entry.name);if(entry.isDirectory())await visit(target);else out.push(target);}}try{await visit(root);}catch(error){if(error.code!=='ENOENT')throw error;}return out.sort();}

const routeFor=(file,contentDir,meta,commerce,routeResolver)=>{if(commerce.url)return String(commerce.url);if(meta.canonical_url)return String(meta.canonical_url);if(routeResolver)return String(routeResolver({file,relative:path.relative(contentDir,file),meta,commerce}));return`/shop/${path.basename(file,'.md')}/`;};
const cartFor=(commerce,variant={})=>{const source={...(commerce.cart||{}),...(variant.cart||{})};return{enabled:source.enabled!==false,quantity:source.quantity!==false,min:Number(source.min??1),max:Number(source.max??99)};};

export async function loadProducts(contentDir,{routeResolver}={}){
  const products=[];
  for(const file of (await filesUnder(contentDir)).filter(name=>name.endsWith('.md'))){
    const parsed=frontmatter(await fs.readFile(file,'utf8'),file),commerce=parsed.meta.commerce;
    if(Object.hasOwn(parsed.meta,'commerce')&&(typeof commerce!=='object'||commerce===null||Array.isArray(commerce)))throw new Error(`Commerce validation failed\n\nFile:\n  ${file}\n\nProblem:\n  commerce metadata must be an object.`);
    if(commerce&&Object.hasOwn(commerce,'enabled')&&typeof commerce.enabled!=='boolean')throw new Error(`Commerce validation failed\n\nFile:\n  ${file}\n\nProblem:\n  commerce.enabled must be true or false.`);
    if(!commerce?.enabled)continue;
    const productId=String(commerce.id||commerce.sku||path.basename(file,'.md')),variants=Array.isArray(commerce.variants)&&commerce.variants.length?commerce.variants:[null];
    for(const variant of variants){
      const data=variant||{},price=normalizeMoney(data.price||commerce.price,{legacyDisplay:data.price?.display||commerce.price?.display});
      products.push({
        source:file,relative:path.relative(contentDir,file),product_id:productId,variant_id:variant?String(data.id||data.sku||''):'',
        title:String(parsed.meta.title||''),variant_name:variant?String(data.name||data.title||''):'',description:String(parsed.meta.description||''),image:String(data.image||parsed.meta.featured_image||''),
        sku:String(data.sku||commerce.sku||''),type:String(data.type||commerce.type||''),price,price_display:price.display||formatMoney(price),currency:price.currency,
        availability:String(data.availability||commerce.availability||'available'),providers:{...(commerce.providers||{}),...(data.providers||{})},cart:cartFor(commerce,data),
        attributes:data.attributes&&typeof data.attributes==='object'&&!Array.isArray(data.attributes)?data.attributes:{},url:routeFor(file,contentDir,parsed.meta,commerce,routeResolver),parsed
      });
    }
  }
  return products;
}

const productFailure=(product,provider,problem)=>`Commerce validation failed\n\nFile:\n  ${product.source}\n\nProvider:\n  ${provider}\n\nProduct:\n  ${product.product_id}${product.variant_id?` / ${product.variant_id}`:''}\n\nProblem:\n  ${problem}`;

export function validateStore(config,products,{configFile='(configuration)'}={}){
  const errors=[],seenSku=new Map(),seenProducts=new Map(),providerId=String(config.provider||'mock');let adapter;
  try{adapter=providerFor(providerId);}catch(error){errors.push(`Commerce config: unknown provider '${providerId}'`);}
  if(config.site_url){try{safeUrl(config.site_url,{allowHttp:true});}catch{errors.push(`${configFile}: site_url must be an http(s) URL without credentials.`);}}
  for(const field of ['content','assets','output']){const value=config[field];if(value!==undefined&&(path.isAbsolute(String(value))||String(value).split(/[\\/]+/).includes('..')))errors.push(`${configFile}: ${field} must be a relative path inside the site root.`);}
  if(config.allowed_origins!==undefined&&(!Array.isArray(config.allowed_origins)||config.allowed_origins.some(value=>{try{const url=new URL(value);return!['http:','https:'].includes(url.protocol)||url.pathname!=='/';}catch{return true;}})))errors.push(`${configFile}: allowed_origins must contain URL origins only.`);
  if(adapter)for(const problem of adapter.validateConfig(config.providers?.[providerId]||{},config))errors.push(`${configFile}: providers.${providerId}: ${problem}`);
  for(const product of products){
    const fail=problem=>errors.push(productFailure(product,providerId,problem));
    if(!PRODUCT_ID.test(product.product_id))fail(`Invalid product id '${product.product_id}'.`);
    if(seenProducts.has(`${product.product_id}:${product.variant_id}`))fail(`Duplicate product/variant identity '${product.product_id}:${product.variant_id}'.`);else seenProducts.set(`${product.product_id}:${product.variant_id}`,product.source);
    if(!product.sku)fail('Missing commerce.sku (or variants[].sku).');else if(!SKU.test(product.sku))fail(`Invalid SKU '${product.sku}'. Use 1-128 letters, numbers, dots, underscores, or hyphens.`);else if(seenSku.has(product.sku))fail(`Duplicate SKU '${product.sku}' (also in ${seenSku.get(product.sku)}).`);else seenSku.set(product.sku,product.source);
    if(!TYPES.has(product.type))fail(`Invalid product type '${product.type}'. Expected digital, physical, service, or subscription.`);
    if(!product.title)fail('Missing product title.');for(const problem of validateMoney(product.price))fail(problem);
    if(!['available','unavailable'].includes(product.availability))fail(`Invalid availability '${product.availability}'. Expected available or unavailable.`);
    if(!Number.isInteger(product.cart.min)||!Number.isInteger(product.cart.max)||product.cart.min<1||product.cart.max<product.cart.min||product.cart.max>999)fail('Invalid cart quantity bounds.');
    try{safeUrl(product.url,{allowHttp:true});}catch{if(!String(product.url).startsWith('/'))fail('Product canonical URL must be an absolute path or safe http(s) URL.');}
    if(adapter){const typeCap={digital:'digital_products',physical:'physical_products',service:'services',subscription:'subscriptions'}[product.type];if(typeCap&&!adapter.capabilities[typeCap])fail(`${providerId} does not support product type '${product.type}'. Change provider, product type, or use Link mode.`);if(product.cart.quantity&&!adapter.capabilities.quantity&&product.cart.max>1)fail(`${providerId} does not support quantity controls above one.`);for(const problem of adapter.validateProduct(product,product.providers[providerId]||{},config.providers?.[providerId]||{}))fail(problem);}
  }
  if(config.cart?.enabled!==false&&adapter&&!adapter.capabilities.multi_item_checkout&&config.cart?.multi_item!==false)errors.push(`${providerId} supports one product per checkout; set cart.multi_item: false.`);
  if(errors.length)throw new Error(errors.join('\n\n'));
}

export function buildCatalog(config,products){
  const providerId=String(config.provider||'mock'),adapter=providerFor(providerId);
  return{schema:'kujo-commerce/v1',schema_version:1,provider:providerId,capabilities:adapter.capabilities,cart:{enabled:config.cart?.enabled!==false,multi_item:config.cart?.multi_item!==false},products:products.map(product=>({product_id:product.product_id,variant_id:product.variant_id||undefined,sku:product.sku,title:product.title,variant_name:product.variant_name||undefined,description:product.description,image:product.image,url:product.url,type:product.type,price:product.price,price_display:product.price_display,currency:product.price.currency,availability:product.availability,attributes:product.attributes,cart:product.cart,provider:adapter.toPublicProduct(product.providers[providerId]||{},product)}))};
}

function productMarkup(group,providerId){const available=group.filter(item=>item.availability==='available'&&item.cart.enabled),first=group[0],adapter=providerFor(providerId),variants=group.length>1;let control='';if(variants){control=`<label>Variant <select data-commerce-variant>${group.map(item=>`<option value="${escapeHtml(item.sku)}"${item.availability!=='available'?' disabled':''}>${escapeHtml(item.variant_name||item.sku)} — ${escapeHtml(item.price_display)}</option>`).join('')}</select></label>`;}const selected=available[0],settings=selected?.providers[providerId]||{};let action='<button type="button" disabled>Unavailable</button>';if(selected){if(!adapter.capabilities.dynamic_checkout&&settings.url){action=`<a href="${escapeHtml(settings.url)}" rel="noopener noreferrer">Buy now</a>`;}else action=`<button type="button" data-commerce-add="${escapeHtml(selected.sku)}">Add to cart</button>`;}const offers=group.map(item=>({"@type":"Offer",sku:item.sku,priceCurrency:item.price.currency,price:moneyDecimal(item.price),url:item.url,availability:item.availability==='available'?'https://schema.org/InStock':'https://schema.org/OutOfStock'}));const data={"@context":"https://schema.org","@type":"Product",name:first.title,description:first.description,productID:first.product_id,offers:offers.length===1?offers[0]:offers};return{html:`<section class="commerce-product" data-commerce-product="${escapeHtml(first.product_id)}">${control}<p class="commerce-price" data-commerce-price>${escapeHtml(selected?.price_display||first.price_display)}</p>${action}<p class="commerce-status" aria-live="polite"></p></section>`,jsonLd:`<script type="application/ld+json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script>`};}

async function copyTree(from,to){try{await fs.cp(from,to,{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}}
async function run(command,args,cwd){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${command} exited ${code}`)));});}

export async function buildStatic({siteRoot='.',output='output',config,products,assetsDir}){
  validateStore(config,products);const target=projectPath(siteRoot,output,'output');await fs.mkdir(path.join(target,'_kujo','commerce'),{recursive:true});await fs.mkdir(path.join(target,'assets','commerce'),{recursive:true});const packageRoot=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');await copyTree(assetsDir||path.join(packageRoot,'browser'),path.join(target,'assets','commerce'));const catalog=buildCatalog(config,products);await fs.writeFile(path.join(target,'_kujo','commerce','catalog.json'),JSON.stringify(catalog,null,2)+'\n');return{catalog,output:target};
}

export async function buildSite({siteRoot,ssgPath,kujo='kujo'}){
  const loaded=await loadConfig(siteRoot,{required:false});
  if(!loaded.config||loaded.config.enabled===false){await run(kujo,['run',path.resolve(ssgPath)],siteRoot);return{disabled:true,products:[],output:path.resolve(siteRoot,loaded.config?.output||'output')};}
  const config=loaded.config,content=projectPath(siteRoot,config.content||'content','content'),products=await loadProducts(content);validateStore(config,products,{configFile:loaded.file});
  const work=path.join(siteRoot,'.kujo-commerce');await fs.rm(work,{recursive:true,force:true});const workContent=path.join(work,'content'),workAssets=path.join(work,'assets');await copyTree(content,workContent);await copyTree(projectPath(siteRoot,config.assets||'assets','assets'),workAssets);await fs.mkdir(path.join(workAssets,'commerce'),{recursive:true});const packageRoot=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');await copyTree(path.join(packageRoot,'browser'),path.join(workAssets,'commerce'));
  const groups=new Map();for(const product of products){const group=groups.get(product.source)||[];group.push(product);groups.set(product.source,group);}for(const group of groups.values()){const first=group[0],out=path.join(workContent,first.relative);await fs.writeFile(out,`---\n${first.parsed.raw}\n---\n${first.parsed.body}\n\nKUJO_COMMERCE_PRODUCT_UI:${first.product_id}\n`);}
  const output=projectPath(siteRoot,config.output||'output','output'),args=['run',path.resolve(ssgPath),'--','--content',workContent,'--assets',workAssets,'--output',output,'--site-url',String(config.site_url||'')];await run(kujo,args,siteRoot);
  for(const file of (await filesUnder(output)).filter(name=>name.endsWith('.html'))){let html=await fs.readFile(file,'utf8'),changed=false;for(const group of groups.values()){const first=group[0],marker=`<p>KUJO_COMMERCE_PRODUCT_UI:${first.product_id}</p>`;if(html.includes(marker)){const rendered=productMarkup(group,String(config.provider||'mock'));html=html.replace(marker,`${rendered.html}${rendered.jsonLd}`);changed=true;}const excerpt=`KUJO_COMMERCE_PRODUCT_UI:${first.product_id}`;if(html.includes(excerpt)){html=html.replaceAll(excerpt,'');changed=true;}}
    if(html.includes('<p>KUJO_COMMERCE_CART_UI</p>')){const mock=String(config.provider||'mock')==='mock';html=html.replace('<p>KUJO_COMMERCE_CART_UI</p>',`<div data-commerce-cart aria-live="polite"></div><div class="commerce-actions"><button type="button" data-commerce-clear>Clear cart</button><button type="button" data-commerce-checkout>${mock?'Demo checkout':'Checkout'}</button></div><p role="alert" data-commerce-error></p>`);changed=true;}
    if(html.includes('<p>KUJO_COMMERCE_MOCK_CHECKOUT_UI</p>')){const routeUrl=value=>{if(!value)return'';try{const url=new URL(value);return url.origin===new URL(config.site_url).origin?`${url.pathname}${url.search}${url.hash}`:value;}catch{return value;}};const success=routeUrl(config.checkout?.success_url)||'/checkout/success/',cancel=routeUrl(config.checkout?.cancel_url)||'/checkout/cancel/';html=html.replace('<p>KUJO_COMMERCE_MOCK_CHECKOUT_UI</p>',`<div data-commerce-mock-checkout data-success-url="${escapeHtml(success)}" data-cancel-url="${escapeHtml(cancel)}" aria-live="polite"></div>`);changed=true;}
    if(changed)await fs.writeFile(file,html);
  }
  const catalog=buildCatalog(config,products),target=path.join(output,'_kujo','commerce');await fs.mkdir(target,{recursive:true});await fs.writeFile(path.join(target,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');return{disabled:false,products,catalog,output};
}
