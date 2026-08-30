import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec=promisify(execFile),cli=path.resolve('bin/kujo-commerce.mjs');

test('init defaults to zero-runtime static Link mode',async()=>{const site=await fs.mkdtemp(path.join(os.tmpdir(),'commerce-init-static-'));const {stdout}=await exec(process.execPath,[cli,'init','--site',site,'--json']);const result=JSON.parse(stdout);assert.equal(result.mode,'static');assert.match(await fs.readFile(path.join(site,'kujo-commerce.yml'),'utf8'),/provider: link/);assert.match(await fs.readFile(path.join(site,'content/shop/example-product.md'),'utf8'),/replace-with-your-hosted-checkout/);await exec(process.execPath,[cli,'validate','--site',site]);});

test('init hybrid explicitly creates the Mock runtime example',async()=>{const site=await fs.mkdtemp(path.join(os.tmpdir(),'commerce-init-hybrid-'));const {stdout}=await exec(process.execPath,[cli,'init','--site',site,'--mode','hybrid','--json']);assert.equal(JSON.parse(stdout).mode,'hybrid');assert.match(await fs.readFile(path.join(site,'kujo-commerce.yml'),'utf8'),/provider: mock/);assert.match(await fs.readFile(path.join(site,'content/shop/example-product.md'),'utf8'),/mock: \{\}/);});
