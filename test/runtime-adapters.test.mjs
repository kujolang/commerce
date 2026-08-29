import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {cloudflareCheckout,cloudflareCheckoutCompletion,cloudflareCustomerPortal} from '../runtime/cloudflare.mjs';
import {netlifyHandler} from '../runtime/netlify.mjs';
import {vercelHandler} from '../runtime/vercel.mjs';

const catalog={provider:'mock',products:[{sku:'a',type:'digital',availability:'available',cart:{min:1,max:2},provider:{}}]};
const config={providers:{mock:{success_url:'https://site.test/checkout/mock/'}}};
const checkoutRequest=()=>new Request('https://site.test/_kujo/commerce/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items:[{sku:'a',quantity:1}]})});

test('Cloudflare adapters pass request, environment, and authenticated portal context',async()=>{const checkout=await cloudflareCheckout({catalog,config})({request:checkoutRequest(),env:{}});assert.equal(checkout.status,200);const portal=await cloudflareCustomerPortal({provider:'mock',config:{providers:{mock:{portal_url:'https://example.com/portal'}}},resolveCustomer:async()=>({customerId:'mock'})})({request:new Request('https://site.test/portal',{method:'POST'}),env:{}});assert.equal(portal.status,200);const completion=await cloudflareCheckoutCompletion({provider:'mock',config})({request:new Request('https://site.test/complete',{method:'POST',headers:{'content-type':'application/json'},body:'{"provider_reference":"mock-reference"}'}),env:{}});assert.equal(completion.status,502)});

test('Netlify adapter preserves standards Request and Response',async()=>{const handler=netlifyHandler(request=>new Response(request.method,{status:202,headers:{'x-runtime':'netlify'}}));const response=await handler(new Request('https://site.test/test',{method:'POST'}));assert.equal(response.status,202);assert.equal(response.headers.get('x-runtime'),'netlify')});

test('Vercel adapter converts Node requests and responses without losing status or headers',async()=>{const request=new EventEmitter();request.method='POST';request.url='/test';request.headers={host:'site.test','content-type':'text/plain'};const result=new Promise(resolve=>{const headers={};const response={statusCode:0,setHeader:(key,value)=>headers[key]=value,end:body=>resolve({status:response.statusCode,headers,body:String(body)})};vercelHandler(async webRequest=>new Response(await webRequest.text(),{status:201,headers:{'x-runtime':'vercel'}}))(request,response)});request.emit('data',Buffer.from('payload'));request.emit('end');const response=await result;assert.equal(response.status,201);assert.equal(response.headers['x-runtime'],'vercel');assert.equal(response.body,'payload')});
