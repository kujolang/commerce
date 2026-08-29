import test from 'node:test';import assert from 'node:assert/strict';import {providerFor} from '../../src/providers.mjs';
const item=(provider,settings,type='digital')=>({sku:'kujo-sandbox',title:'Kujo Commerce sandbox acceptance',type,quantity:1,price:{amount:100,currency:'USD',display:'$1.00'},provider:settings});
const checkout={success_url:'https://example.com/success',cancel_url:'https://example.com/cancel',checkout_url:'https://example.com/checkout'};
const cases=[
  {id:'stripe',required:['STRIPE_SECRET_KEY','STRIPE_TEST_PRICE_ID'],settings:()=>({price_id:process.env.STRIPE_TEST_PRICE_ID}),config:{...checkout,secret_key_env:'STRIPE_SECRET_KEY'}},
  {id:'polar',required:['POLAR_ACCESS_TOKEN','POLAR_TEST_PRODUCT_ID'],settings:()=>({product_id:process.env.POLAR_TEST_PRODUCT_ID}),config:{...checkout,access_token_env:'POLAR_ACCESS_TOKEN'}},
  {id:'square',required:['SQUARE_ACCESS_TOKEN','SQUARE_LOCATION_ID','SQUARE_TEST_CATALOG_OBJECT_ID'],settings:()=>({catalog_object_id:process.env.SQUARE_TEST_CATALOG_OBJECT_ID}),config:{...checkout,access_token_env:'SQUARE_ACCESS_TOKEN',get location_id(){return process.env.SQUARE_LOCATION_ID;}}},
  {id:'paddle',required:['PADDLE_API_KEY','PADDLE_TEST_PRICE_ID'],settings:()=>({price_id:process.env.PADDLE_TEST_PRICE_ID}),config:{...checkout,api_key_env:'PADDLE_API_KEY'}},
  {id:'lemon-squeezy',required:['LEMON_SQUEEZY_API_KEY','LEMON_SQUEEZY_STORE_ID','LEMON_SQUEEZY_TEST_VARIANT_ID'],settings:()=>({variant_id:process.env.LEMON_SQUEEZY_TEST_VARIANT_ID}),config:{...checkout,api_key_env:'LEMON_SQUEEZY_API_KEY',get store_id(){return process.env.LEMON_SQUEEZY_STORE_ID;}}},
  {id:'paypal',required:['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET'],settings:()=>({item_id:'kujo-sandbox'}),config:{...checkout,client_id_env:'PAYPAL_CLIENT_ID',client_secret_env:'PAYPAL_CLIENT_SECRET'}}
];
for(const value of cases)test(`${value.id} sandbox creates a real hosted checkout`,{skip:value.required.some(name=>!process.env[name])},async()=>{const result=await providerFor(value.id).createCheckout([item(value.id,value.settings())],value.config,process.env,{checkoutAttempt:`sandbox-${Date.now()}`});assert.match(result.checkout_url,/^https:\/\//);assert.doesNotMatch(result.checkout_url,/example\.com/);});
