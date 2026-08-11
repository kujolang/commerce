import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import YAML from 'yaml';
import { capabilities } from './providers.mjs';

const TYPES = new Set(['digital','physical','service','subscription']);
const CURRENCIES = /^[A-Z]{3}$/;
const URL_OK = value => { try { const u=new URL(value); return ['http:','https:'].includes(u.protocol); } catch { return false; } };

function frontmatter(text, file) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta:{}, body:text, raw:'' };
  try { return { meta:YAML.parse(match[1]) || {}, body:text.slice(match[0].length), raw:match[1] }; }
  catch (error) { throw new Error(`${file}: malformed frontmatter: ${error.message}`); }
}

async function filesUnder(root) {
  const out=[];
  async function visit(dir) {
    for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
      const p=path.join(dir,entry.name);
      if (entry.isDirectory()) await visit(p); else out.push(p);
    }
  }
  try { await visit(root); } catch (e) { if (e.code!=='ENOENT') throw e; }
  return out.sort();
}

export async function loadProducts(contentDir) {
  const products=[];
  for (const file of (await filesUnder(contentDir)).filter(f=>f.endsWith('.md'))) {
    const parsed=frontmatter(await fs.readFile(file,'utf8'),file);
    const c=parsed.meta.commerce;
    if (!c?.enabled) continue;
    const price=c.price || {};
    products.push({
      source:file, relative:path.relative(contentDir,file), title:String(parsed.meta.title||''),
      description:String(parsed.meta.description||''), image:String(parsed.meta.featured_image||''),
      sku:String(c.sku||''), type:String(c.type||''), price_display:String(price.display||''),
      currency:String(price.currency||''), availability:String(c.availability||'available'),
      providers:c.providers||{}, cart:{enabled:c.cart?.enabled!==false,quantity:c.cart?.quantity!==false,min:Number(c.cart?.min??1),max:Number(c.cart?.max??99)},
      url:`/shop/${path.basename(file,'.md')}/`, parsed
    });
  }
  return products;
}

export function validateStore(config, products) {
  const errors=[], seen=new Map();
  const provider=String(config.provider||'mock');
  const caps=capabilities[provider];
  if (!caps) errors.push(`Commerce config: unknown provider '${provider}'`);
  for (const p of products) {
    const fail=problem=>errors.push(`Commerce validation failed\n\nFile:\n  ${p.source}\n\nProvider:\n  ${provider}\n\nProblem:\n  ${problem}`);
    if (!p.sku) fail('Missing commerce.sku.');
    else if (seen.has(p.sku)) fail(`Duplicate SKU '${p.sku}' (also in ${seen.get(p.sku)}).`); else seen.set(p.sku,p.source);
    if (!TYPES.has(p.type)) fail(`Invalid product type '${p.type}'. Expected digital, physical, service, or subscription.`);
    if (!CURRENCIES.test(p.currency)) fail(`Invalid currency '${p.currency}'. Use a three-letter uppercase ISO code.`);
    if (!Number.isInteger(p.cart.min)||!Number.isInteger(p.cart.max)||p.cart.min<1||p.cart.max<p.cart.min||p.cart.max>999) fail('Invalid cart quantity bounds.');
    if (caps) {
      const typeCap={digital:'digital_products',physical:'physical_products',service:'services',subscription:'subscriptions'}[p.type];
      if (typeCap && !caps[typeCap]) fail(`${provider} does not support product type '${p.type}'. Change provider, product type, or use Link mode.`);
      if (p.cart.quantity && !caps.quantity) fail(`${provider} does not support quantity controls.`);
    }
    const pc=p.providers[provider];
    if (provider==='stripe' && !pc?.price_id && !pc?.url) fail('Stripe requires providers.stripe.price_id or a hosted-link url.');
    if (provider==='polar' && !pc?.product_id && !pc?.url) fail('Polar requires providers.polar.product_id or a checkout-link url.');
    if (provider==='link' && !URL_OK(pc?.url||'')) fail('Link requires a valid http(s) providers.link.url.');
  }
  if (config.cart?.enabled!==false && caps && !caps.multi_item_checkout && config.cart?.multi_item!==false) errors.push(`${provider} supports one product per checkout; set cart.multi_item: false.`);
  if (errors.length) throw new Error(errors.join('\n\n'));
}

function productMarkup(p, provider) {
  const available=p.availability==='available';
  const pc=p.providers[provider]||{};
  const link=pc.url && URL_OK(pc.url) ? `<a class="sk-button" href="${pc.url}" rel="noopener">Buy now</a>` : '';
  const action=available ? (provider==='link' ? link : `<button class="sk-button" type="button" data-commerce-add="${p.sku}">Add to cart</button>`) : '<button class="sk-button" type="button" disabled>Unavailable</button>';
  const data={"@context":"https://schema.org","@type":"Product",name:p.title,description:p.description,sku:p.sku,url:p.url,offers:{"@type":"Offer",priceCurrency:p.currency,price:p.price_display.replace(/[^0-9.]/g,''),availability:available?'https://schema.org/InStock':'https://schema.org/OutOfStock'}};
  return `\n<section class="commerce-product" data-commerce-product="${p.sku}"><p class="commerce-price">${p.price_display}</p>${action}<p class="commerce-status" aria-live="polite"></p></section>\n<script type="application/ld+json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script>\n`;
}

async function copyTree(from,to) { try { await fs.cp(from,to,{recursive:true}); } catch(e) { if(e.code!=='ENOENT') throw e; } }
async function run(command,args,cwd) { return new Promise((resolve,reject)=>{ const p=spawn(command,args,{cwd,stdio:'inherit'}); p.on('error',reject); p.on('exit',code=>code===0?resolve():reject(new Error(`${command} exited ${code}`))); }); }

export async function buildSite({siteRoot,ssgPath,kujo='kujo'}) {
  const cfgPath=['kujo-commerce.yml','kujo-commerce.yaml','kujo-commerce.json'].map(n=>path.join(siteRoot,n));
  let selected; for(const p of cfgPath){try{await fs.access(p);selected=p;break}catch{}}
  if(!selected) throw new Error('Missing kujo-commerce.yml');
  const config=selected.endsWith('.json')?JSON.parse(await fs.readFile(selected,'utf8')):YAML.parse(await fs.readFile(selected,'utf8'));
  if(config.enabled===false) return {disabled:true,products:[]};
  const content=path.resolve(siteRoot,config.content||'content');
  const products=await loadProducts(content); validateStore(config,products);
  const work=path.join(siteRoot,'.kujo-commerce'); await fs.rm(work,{recursive:true,force:true});
  const workContent=path.join(work,'content'), workAssets=path.join(work,'assets');
  await copyTree(content,workContent); await copyTree(path.join(siteRoot,config.assets||'assets'),workAssets);
  await fs.mkdir(path.join(workAssets,'commerce'),{recursive:true});
  const packageRoot=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
  await copyTree(path.join(packageRoot,'browser'),path.join(workAssets,'commerce'));
  for(const p of products){ const out=path.join(workContent,p.relative); await fs.writeFile(out,`---\n${p.parsed.raw}\n---\n${p.parsed.body}${productMarkup(p,String(config.provider||'mock'))}`); }
  const output=path.resolve(siteRoot,config.output||'output');
  const args=['run',path.resolve(ssgPath),'--','--content',workContent,'--assets',workAssets,'--output',output,'--site-url',String(config.site_url||'')];
  await run(kujo,args,siteRoot);
  const catalog={schema:'kujo-commerce/v1',provider:String(config.provider||'mock'),products:products.map(({sku,title,description,image,url,type,price_display,currency,availability,cart,providers})=>({sku,title,description,image,url,type,price_display,currency,availability,cart,provider_public:providers[config.provider]?.url?{url:providers[config.provider].url}:undefined}))};
  const target=path.join(output,'_kujo','commerce'); await fs.mkdir(target,{recursive:true}); await fs.writeFile(path.join(target,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
  return {disabled:false,products,catalog,output};
}
