#!/usr/bin/env node
import path from 'node:path';
import { buildSite, loadProducts, validateStore } from '../src/pipeline.mjs';
import fs from 'node:fs/promises';
import YAML from 'yaml';
import { verifyRemote } from '../src/verify.mjs';

const argv=process.argv.slice(2), command=argv.shift()||'help';
const value=flag=>{const i=argv.indexOf(flag);return i>=0?argv[i+1]:undefined};
try {
  if(command==='build') {
    const result=await buildSite({siteRoot:path.resolve(value('--site')||'.'),ssgPath:path.resolve(value('--ssg')||'vendor/ssg/build.kujo'),kujo:value('--kujo')||'kujo'});
    console.log(result.disabled?'Commerce disabled':`Commerce build complete\n  Products: ${result.products.length}\n  Output: ${result.output}`);
  } else if(command==='validate') {
    const root=path.resolve(value('--site')||'.'), raw=await fs.readFile(path.join(root,'kujo-commerce.yml'),'utf8'), cfg=YAML.parse(raw);
    const products=await loadProducts(path.join(root,cfg.content||'content')); validateStore(cfg,products); console.log(`Commerce validation passed (${products.length} products)`);
  } else if(command==='verify') {
    const root=path.resolve(value('--site')||'.'), raw=await fs.readFile(path.join(root,'kujo-commerce.yml'),'utf8'), cfg=YAML.parse(raw),products=await loadProducts(path.join(root,cfg.content||'content'));validateStore(cfg,products);const results=await verifyRemote(cfg,products);for(const item of results)console.log(`${item.status.toUpperCase()} ${item.sku}: ${item.message}`);if(results.some(item=>item.status==='error'))process.exitCode=1;
  } else {
    console.log('Usage: kujo-commerce <build|validate|verify> [--site DIR] [--ssg FILE] [--kujo BIN]');
  }
} catch(error){ console.error(error.message); process.exitCode=1; }
