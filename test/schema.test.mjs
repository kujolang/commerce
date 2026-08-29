import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {buildCatalog,loadProducts} from '../src/pipeline.mjs';

const directory=path.resolve('schemas'),names=['money','provider-capabilities','product','variant','catalog','cart','checkout-request','checkout-response','event','config'];
const schemas=Object.fromEntries(await Promise.all(names.map(async name=>[name,JSON.parse(await fs.readFile(path.join(directory,`${name}.schema.json`),'utf8'))])));
const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);Object.values(schemas).forEach(schema=>ajv.addSchema(schema));

test('all JSON schemas compile',()=>{for(const schema of Object.values(schemas))assert.equal(typeof ajv.getSchema(schema.$id),'function');});
test('schemas reject malformed cart and event payloads',()=>{assert.equal(ajv.validate(schemas.cart,{schema:'kujo-cart/v1',items:[{sku:'bad sku',quantity:0}]}),false);assert.equal(ajv.validate(schemas.event,{schema:'kujo-commerce-event/v1',provider:'mock',type:'anything'}),false);});
test('generated catalog satisfies the catalog contract',async()=>{const products=await loadProducts(fileURLToPath(new URL('fixtures/content',import.meta.url)));const catalog=buildCatalog({provider:'mock',cart:{}},products);assert.equal(ajv.validate(schemas.catalog,catalog),true,JSON.stringify(ajv.errors));});
