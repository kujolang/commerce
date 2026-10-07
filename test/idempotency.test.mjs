import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryIdempotencyStore,executeProviderOperation} from '../src/idempotency.mjs';
import {providerFor} from '../src/providers.mjs';
import {subscriptionHandler} from '../runtime/index.mjs';

const spec=(operation_id,type='subscription.create')=>({operation_id,type,intent:{provider:'square',merchant:'merchant_1',environment:'sandbox',sku:'plan'}});

test('long operation identities allocate distinct persisted UUIDs and retries retain them',async()=>{
  const store=createMemoryIdempotencyStore(),a=spec('a'.repeat(100)+'1'),b=spec('a'.repeat(100)+'2');
  const first=await store.begin(a),second=await store.begin(b);
  assert.match(first.idempotency_key,/^[0-9a-f-]{36}$/);
  assert.notEqual(first.idempotency_key,second.idempotency_key);
  assert.equal((await store.begin(a)).idempotency_key,first.idempotency_key);
  assert.notEqual((await store.begin(spec('card-op','card.create'))).idempotency_key,first.idempotency_key);
  for(const changed of [{...a,type:'card.create'},{...a,intent:{...a.intent,sku:'other'}},{...a,intent:{...a.intent,merchant:'merchant_2'}},{...a,intent:{...a.intent,environment:'production'}}])await assert.rejects(()=>store.begin(changed),/conflicts/);
  assert.equal((await store.begin({...a,intent:{sku:'plan',environment:'sandbox',merchant:'merchant_1',provider:'square'}})).idempotency_key,first.idempotency_key);
});

test('concurrent begin and execution choose one key and one in-flight mutation',async()=>{
  const store=createMemoryIdempotencyStore(),operation=spec('concurrent');
  const records=await Promise.all(Array.from({length:16},()=>store.begin(operation)));
  assert.equal(new Set(records.map(record=>record.idempotency_key)).size,1);
  let calls=0,release;const barrier=new Promise(resolve=>{release=resolve;});
  const run=()=>executeProviderOperation(operation,{store,mutate:async key=>{calls++;await barrier;return{key};}});
  const first=run();await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(run,/transition/);release();await first;assert.equal(calls,1);
});

test('never-submitted, known, unknown, crashed and legacy operations never rekey',async()=>{
  for(const state of ['not_started','succeeded','unknown','submitted']){
    const store=createMemoryIdempotencyStore(),operation=spec(`legacy-${state}`),key='kujo-'+ 'a'.repeat(40);
    await store.begin({...operation,idempotency_key:key});
    if(state!=='not_started')await store.transition(operation.operation_id,'submitted');
    if(['succeeded','unknown'].includes(state))await store.transition(operation.operation_id,state,{result:state==='succeeded'?{key}:undefined});
    let calls=0;const run=()=>executeProviderOperation(operation,{store,mutate:async received=>{calls++;assert.equal(received,key);return{key};}});
    if(state==='submitted'){await assert.rejects(run,/transition/);assert.equal(calls,0);await store.transition(operation.operation_id,'unknown');}
    assert.equal((await run()).key,key);assert.equal((await store.get(operation.operation_id)).idempotency_key,key);
    assert.equal(calls,state==='succeeded'?0:1);
    await assert.rejects(()=>store.begin({...operation,idempotency_key:'replacement'}),/conflicts/);
  }
});

test('Square rejects lossy legacy inputs before sending and accepts explicit materialized keys unchanged',async()=>{
  const square=providerFor('square'),keys=[],config={location_id:'LOCATION'},env={SQUARE_ACCESS_TOKEN:'fixture'},item={type:'one_time',quantity:1,provider:{catalog_object_id:'ITEM'}};
  const fetch=async(_url,options)=>{keys.push(JSON.parse(options.body).idempotency_key);return new Response(JSON.stringify({payment_link:{id:'link',url:'https://square.link/fixture'},customer:{id:'customer'}}));};
  for(const key of ['a'.repeat(45)+'1','a'.repeat(45)+'2','a.b','a b']){
    await assert.rejects(()=>square.createCheckout([item],config,env,{checkoutAttempt:key,fetch}),/idempotency key/);
    await assert.rejects(()=>square.createCustomer({},config,env,{idempotencyKey:key,fetch}),/idempotency key/);
    await assert.rejects(()=>square.createSavedPaymentMethod({source_id:'single-use',customer_id:'customer',consent:{payment_method_storage_authorized:true,recurring_authorized:true}},config,env,{idempotencyKey:key,fetch}),/idempotency key/);
    await assert.rejects(()=>square.createSubscription({type:'subscription',provider:{plan_variation_id:'PLAN123'}},config,env,{customerId:'customer',consent:{recurring_authorized:true},idempotencyKey:key,fetch}),/idempotency key/);
  }
  assert.equal(keys.length,0);
  await square.createCheckout([item],config,env,{checkoutAttempt:'legacy-key',fetch});
  await square.createCheckout([item],config,env,{checkoutAttempt:'a'.repeat(100),idempotencyKey:'persisted-key',fetch});
  assert.deepEqual(keys,['legacy-key','persisted-key']);
});

test('subscription HTTP long IDs have distinct keys, scope and effect intent are bound, unbound legacy fails closed',async()=>{
  const store=createMemoryIdempotencyStore(),keys=[],catalog={provider:'square',products:[{sku:'plan',type:'subscription',availability:'available',provider:{plan_variation_id:'PLAN123'}}]};
  const options={catalog,config:{providers:{square:{location_id:'LOCATION'}}},env:{SQUARE_ACCESS_TOKEN:'fixture'},idempotencyStore:store,resolveSubscriptionContext:async()=>({customerId:'customer',cardId:'card',connectionId:'merchant',consent:{recurring_authorized:true}}),fetch:async(_url,init)=>{keys.push(JSON.parse(init.body).idempotency_key);return new Response(JSON.stringify({subscription:{id:'sub',status:'ACTIVE'}}));}};
  const run=(id,overrides={})=>subscriptionHandler(new Request('https://site.test/subscription',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation_id:id,sku:'plan'})}),{...options,...overrides});
  const a='a'.repeat(100)+'1',b='a'.repeat(100)+'2';
  assert.equal((await run(a)).status,201);assert.equal((await run(b)).status,201);assert.notEqual(keys[0],keys[1]);
  assert.equal((await run(a)).status,201);assert.equal(keys.length,2);
  for(const field of ['customerId','cardId','connectionId','startDate'])assert.equal((await run(a,{resolveSubscriptionContext:async()=>({...await options.resolveSubscriptionContext(),[field]:'changed'})})).status,502);
  for(const config of [{location_id:'other'},{location_id:'LOCATION',api_base:'https://connect.squareup.com'}])assert.equal((await run(a,{config:{providers:{square:config}}})).status,502);
  assert.equal((await run(a,{catalog:{...catalog,products:[{...catalog.products[0],provider:{plan_variation_id:'OTHER'}}]}})).status,502);
  await store.begin({operation_id:'legacy',type:'subscription.create',idempotency_key:'kujo-legacy',intent:{provider:'square',sku:'plan',offer_revision:null,customer_reference:null}});
  await store.transition('legacy','submitted');await store.transition('legacy','unknown');
  assert.equal((await run('legacy')).status,502);assert.equal((await store.get('legacy')).idempotency_key,'kujo-legacy');assert.equal(keys.length,2);
});
