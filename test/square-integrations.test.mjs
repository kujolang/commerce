import test from 'node:test';
import assert from 'node:assert/strict';
import {createSquareIntegrations,applyInventoryCount,createTerminalService} from '../src/integrations/index.mjs';
import {createMemoryIdempotencyStore} from '../src/idempotency.mjs';
import {createMemoryPaymentStore,createPaymentService} from '../src/payments/index.mjs';
import {providerFor} from '../src/providers.mjs';
import {scope,input} from './fixtures/owned-payments.mjs';

test('optional integrations default off and physical counts use scope-specific persistent keys',async()=>{
  const keys=[],operationStore=createMemoryIdempotencyStore(),base={scope,config:{location_id:'LOCATION'},env:{SQUARE_ACCESS_TOKEN:'fixture'},operationStore,context:{fetch:async(_url,options)=>{keys.push(JSON.parse(options.body).idempotency_key);return Response.json({counts:[]});}}};
  await assert.rejects(()=>createSquareIntegrations(base).countInventory({}),/disabled/);assert.equal(keys.length,0);
  const args={operationId:'same',catalogObjectId:'ITEM',quantity:'5.25',occurredAt:'2026-10-07T10:00:00Z'};
  const first=createSquareIntegrations({...base,enabled:{inventory:true}});await first.countInventory(args);await first.countInventory(args);assert.equal(keys.length,1);
  await createSquareIntegrations({...base,scope:{...scope,merchant_id:'other'},enabled:{inventory:true}}).countInventory(args);assert.notEqual(keys[0],keys[1]);
  await assert.rejects(()=>first.countInventory({...args,quantity:'10'}),/conflict/);
});
test('inventory observations replace counts once and reject equal-time conflicts',()=>{
  const first={catalog_object_id:'ITEM',location_id:'LOCATION',state:'IN_STOCK',quantity:'3',calculated_at:'2026-10-07T10:00:00Z'};
  assert.deepEqual(applyInventoryCount(first,first),first);assert.deepEqual(applyInventoryCount(first,{...first,quantity:'2',calculated_at:'2026-10-07T09:00:00Z'}),first);
  assert.throws(()=>applyInventoryCount(first,{...first,quantity:'4'}),/conflict/);
  assert.throws(()=>applyInventoryCount(first,{...first,location_id:'OTHER'}),/scope/);
});
test('catalog drift rejects overwrite before mutation',async()=>{
  let posts=0;const integrations=createSquareIntegrations({scope,config:{location_id:'LOCATION'},env:{SQUARE_ACCESS_TOKEN:'fixture'},operationStore:createMemoryIdempotencyStore(),enabled:{catalog:true},context:{fetch:async(_url,options)=>{if(options.method==='POST')posts++;return Response.json({object:{id:'ITEM',version:3}});}}});
  await assert.rejects(()=>integrations.exportCatalog({operationId:'sync',objects:[{id:'ITEM',type:'ITEM',version:2,item_data:{name:'Name'}}],expectedVersions:{ITEM:2}}),/drift/);assert.equal(posts,0);
});
test('Terminal requires a scoped paired device and reserves the order route until retrieved payment completion',async()=>{
  const store=createMemoryPaymentStore(),provider=providerFor('square');let status='PENDING',posts=0;
  const context={fetch:async(url,options)=>{if(url.endsWith('/v2/terminals/checkouts')){posts++;return Response.json({checkout:{id:'terminal',status:'PENDING',location_id:'LOCATION',amount_money:{amount:1000,currency:'USD'}}});}if(url.endsWith('/v2/terminals/checkouts/terminal'))return Response.json({checkout:{id:'terminal',status,location_id:'LOCATION',amount_money:{amount:1000,currency:'USD'},payment_ids:['payment']}});return Response.json({payment:{id:'payment',status:'COMPLETED',amount_money:{amount:1000,currency:'USD'},location_id:'LOCATION',updated_at:'2026-10-07T12:00:00Z'}});}},options={store,provider,scope,config:{location_id:'LOCATION'},env:{SQUARE_ACCESS_TOKEN:'fixture'},context};
  const service=createPaymentService(options);await service.create(input);
  const terminal=createTerminalService({...options,service,enabled:true,resolveDevice:async({deviceId,actor})=>actor==='admin'?{id:deviceId,merchant_id:'merchant',location_id:'LOCATION',paired:true}:null});
  await assert.rejects(()=>terminal.checkout({orderId:'order',operationId:'terminal-op',deviceId:'device',actor:'other'}),/authorization/);
  const args={orderId:'order',operationId:'terminal-op',deviceId:'device',actor:'admin'};await terminal.checkout(args);await terminal.checkout(args);assert.equal(posts,1);
  await assert.rejects(()=>service.pay({orderId:'order',attemptId:'embedded',sourceToken:'source'}),/unresolved/);
  assert.equal((await terminal.reconcile(args)).status,'pending');status='COMPLETED';assert.equal((await terminal.reconcile(args)).status,'completed');assert.equal((await service.get('order')).state,'open');
});
