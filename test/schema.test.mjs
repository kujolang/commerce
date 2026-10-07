import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {buildCatalog,loadProducts} from '../src/pipeline.mjs';
import {providerFor} from '../src/providers.mjs';
import {squareEventFixtures} from './fixtures/square-events.mjs';

const directory=path.resolve('schemas'),names=['money','provider-capabilities','product','variant','catalog','cart','checkout-request','checkout-response','event','config','offer-revision','downstream-event'];
const schemas=Object.fromEntries(await Promise.all(names.map(async name=>[name,JSON.parse(await fs.readFile(path.join(directory,`${name}.schema.json`),'utf8'))])));
const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);Object.values(schemas).forEach(schema=>ajv.addSchema(schema));

test('all JSON schemas compile',()=>{for(const schema of Object.values(schemas))assert.equal(typeof ajv.getSchema(schema.$id),'function');});
for(const {input,expected} of squareEventFixtures)test(`Square observation ${input.event_id}: ${input.type} normalizes to ${expected}`,()=>{
  const normalized=providerFor('square').normalizeWebhookEvent(input);
  assert.equal(normalized.type,expected);
  assert.equal(normalized.provider_object_id,input.data.id);
  assert.equal(ajv.validate(schemas.event,normalized),true,JSON.stringify(ajv.errors));
});
test('Square ignores non-Square event type aliases and missing payment status',()=>{
  for(const input of [
    {event_type:'invoice.payment_made'},
    {meta:{event_name:'invoice.payment_made'}},
    {type:'payment.updated',data:{object:{payment:{}}}},
    {type:'payment.updated',data:{object:{status:'COMPLETED'}}}
  ]){
    const normalized=providerFor('square').normalizeWebhookEvent({event_id:'square_unknown',...input});
    assert.equal(normalized.type,input.type==='payment.updated'?'commerce.payment.updated':'commerce.unknown');
    assert.equal(ajv.validate(schemas.event,normalized),true,JSON.stringify(ajv.errors));
  }
});
test('schemas reject malformed cart and event payloads',()=>{assert.equal(ajv.validate(schemas.cart,{schema:'kujo-cart/v1',items:[{sku:'bad sku',quantity:0}]}),false);assert.equal(ajv.validate(schemas.event,{schema:'kujo-commerce-event/v1',provider:'mock',type:'anything'}),false);});
test('generated catalog satisfies the catalog contract',async()=>{const products=await loadProducts(fileURLToPath(new URL('fixtures/content',import.meta.url)));const catalog=buildCatalog({provider:'mock',cart:{}},products);assert.equal(ajv.validate(schemas.catalog,catalog),true,JSON.stringify(ajv.errors));});
