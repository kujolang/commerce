import test from 'node:test';import assert from 'node:assert/strict';
import {CART_SCHEMA,addItem,cartCount,emptyCart,parseCart,removeItem,setItemQuantity} from '../browser/cart-core.js';

test('malformed and unknown-version storage reset safely',()=>{assert.deepEqual(parseCart('{bad'),emptyCart());assert.deepEqual(parseCart(JSON.stringify({schema:'future',items:[{sku:'x',quantity:1}]})),emptyCart())});
test('storage drops malformed items and authoritative browser prices',()=>{assert.deepEqual(parseCart(JSON.stringify({schema:CART_SCHEMA,items:[{sku:'a',quantity:2,price:1},{sku:'',quantity:1},{sku:'b',quantity:0}]})),{schema:CART_SCHEMA,items:[{sku:'a',quantity:2}]})});
test('add, increment, max, remove, and count are deterministic',()=>{let cart=addItem(emptyCart(),'a',2,3);cart=addItem(cart,'a',4,3);cart=addItem(cart,'b',1,9);assert.deepEqual(cart.items,[{sku:'a',quantity:3},{sku:'b',quantity:1}]);assert.equal(cartCount(cart),4);assert.deepEqual(removeItem(cart,'a').items,[{sku:'b',quantity:1}])});
test('quantity clamps to bounds and values below one remove',()=>{let cart=addItem(emptyCart(),'a');cart=setItemQuantity(cart,'a',99,1,10);assert.equal(cart.items[0].quantity,10);cart=setItemQuantity(cart,'a',0,1,10);assert.deepEqual(cart.items,[])});
