import {test,expect} from '@playwright/test';
const session={session_id:'order',expires_at:'2099-01-01T00:00:00Z',amount:'10.00',currency:'USD',application_id:'app',location_id:'location',environment:'sandbox',status:{payments:[]}};
async function mount(page,{fail=false,existing=false}={}){
  let submissions=0;
  await page.route('**/session',route=>route.fulfill({json:{...session,status:{payments:existing?[{status:'pending'}]:[]}}}));
  await page.route('**/pay',async route=>{submissions++;expect(route.request().postDataJSON()).toEqual({order_id:'order',source_token:'ephemeral'});await route.fulfill({status:fail?503:201,json:fail?{error:'payment_unavailable'}:{status:'completed'}});});
  await page.route('**/status?*',route=>route.fulfill({json:{payments:[{status:'pending'}]}}));
  await page.goto('/');
  await page.evaluate(async()=>{
    document.body.innerHTML='<form><div id="card"></div><button>Pay</button><p id="status"></p></form>';
    const {mountSquareCheckout}=await import('/assets/commerce/square-checkout.js');
    window.tokenizations=0;
    window.checkout=await mountSquareCheckout({form:document.querySelector('form'),cardTarget:'#card',button:document.querySelector('button'),status:document.querySelector('#status'),session:{items:[{sku:'item',quantity:1}]},sessionUrl:'/session',payUrl:'/pay',statusUrl:'/status',restartUrl:'/restart',square:{payments:()=>({card:async()=>({attach:async()=>{},destroy:async()=>{},tokenize:async details=>{window.tokenizations++;window.verification=details;await new Promise(resolve=>setTimeout(resolve,50));return{status:'OK',token:'ephemeral'};}})})}});
  });
  return ()=>submissions;
}
test('Square checkout verifies server money, suppresses duplicate clicks and keeps tokens out of storage',async({page})=>{
  const submissions=await mount(page);await page.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  await expect(page.locator('#status')).toHaveText('Payment received.');expect(submissions()).toBe(1);
  expect(await page.evaluate(()=>window.verification)).toMatchObject({amount:'10.00',currencyCode:'USD',intent:'CHARGE',customerInitiated:true,sellerKeyedIn:false});
  expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain('ephemeral');await expect(page.locator('button')).toBeDisabled();
});
test('uncertain payment remains locked and refresh never submits a new charge',async({page})=>{
  const submissions=await mount(page,{fail:true});await page.locator('button').click();await expect(page.locator('#status')).toContainText('Do not submit another payment');await expect(page.locator('button')).toBeDisabled();
  await page.evaluate(()=>window.checkout.refresh());expect(submissions()).toBe(1);await expect(page.locator('#status')).toHaveText('Payment status: pending.');
});
test('existing pending payment disables submission before tokenization',async({page})=>{
  const submissions=await mount(page,{existing:true});await expect(page.locator('button')).toBeDisabled();expect(submissions()).toBe(0);expect(await page.evaluate(()=>window.tokenizations)).toBe(0);
});

test('explicit restart refuses an uncertain payment',async({page})=>{
  await mount(page,{fail:true});await page.locator('button').click();
  await expect(page.locator('#status')).toContainText('needs confirmation');
  expect(await page.evaluate(async()=>{try{await window.checkout.restart();return 'unexpected';}catch(error){return error.message;}})).toBe('Payment status needs confirmation');
  await expect(page.locator('button')).toBeDisabled();
});


test('confirmed failed payment can explicitly start a new attempt',async({page})=>{
  await mount(page,{fail:true});await page.locator('button').click();await expect(page.locator('#status')).toContainText('needs confirmation');
  await page.route('**/status?*',route=>route.fulfill({json:{payments:[{status:'failed'}]}}));
  let restarts=0;await page.route('**/restart',route=>{restarts++;return route.fulfill({json:{id:'order'}});});
  await page.evaluate(()=>window.checkout.restart());await expect(page.locator('button')).toBeEnabled();expect(restarts).toBe(1);
});
