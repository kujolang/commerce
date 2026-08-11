export const CART_SCHEMA = 'kujo-cart/v1';
export const CART_STORAGE_KEY = 'kujo:commerce:cart:v1';

export function emptyCart(){return{schema:CART_SCHEMA,items:[]}}
export function parseCart(raw){try{const value=JSON.parse(raw);if(value?.schema!==CART_SCHEMA||!Array.isArray(value.items))return emptyCart();const items=value.items.filter(item=>typeof item?.sku==='string'&&item.sku.length>0&&Number.isInteger(item.quantity)&&item.quantity>0).map(item=>({sku:item.sku,quantity:item.quantity}));return{schema:CART_SCHEMA,items}}catch{return emptyCart()}}
export function addItem(cart,sku,quantity=1,max=99){const next=structuredClone(cart),item=next.items.find(value=>value.sku===sku),safe=Math.max(1,Math.min(max,Number(quantity)||1));if(item)item.quantity=Math.min(max,item.quantity+safe);else next.items.push({sku,quantity:safe});return next}
export function removeItem(cart,sku){return{schema:CART_SCHEMA,items:cart.items.filter(item=>item.sku!==sku)}}
export function setItemQuantity(cart,sku,quantity,min=1,max=99){const next=structuredClone(cart),item=next.items.find(value=>value.sku===sku);if(!item)return next;const numeric=Number(quantity);if(!Number.isFinite(numeric)||numeric<1)return removeItem(next,sku);item.quantity=Math.max(min,Math.min(max,Math.trunc(numeric)));return next}
export function cartCount(cart){return cart.items.reduce((total,item)=>total+item.quantity,0)}
