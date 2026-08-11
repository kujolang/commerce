#!/usr/bin/env node
import path from 'node:path';
import { buildSite, loadProducts, validateStore } from '../src/pipeline.mjs';
import fs from 'node:fs/promises';
import YAML from 'yaml';

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
    console.log('Remote verification is read-only; configure provider credentials and use provider-specific health endpoints documented in docs/providers.md.');
  } else {
    console.log('Usage: kujo-commerce <build|validate|verify> [--site DIR] [--ssg FILE] [--kujo BIN]');
  }
} catch(error){ console.error(error.message); process.exitCode=1; }
