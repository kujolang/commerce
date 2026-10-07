const SDK={sandbox:'https://sandbox.web.squarecdn.com/v1/square.js',production:'https://web.squarecdn.com/v1/square.js'};
export async function loadSquare(environment,{document:doc=document}={}){
  const url=SDK[environment];if(!url)throw new Error('Unsupported checkout environment');
  if(globalThis.Square)return globalThis.Square;
  await new Promise((resolve,reject)=>{const script=doc.createElement('script');script.src=url;script.onload=resolve;script.onerror=()=>reject(new Error('Secure card entry could not load'));doc.head.append(script);});
  if(!globalThis.Square)throw new Error('Secure card entry unavailable');return globalThis.Square;
}
// The host supplies a same-origin session endpoint and authenticated cookies.
// Tokens live only in this call stack; never localStorage, URLs, or diagnostics.
export async function mountSquareCheckout({form,cardTarget,button,status,session,sessionUrl,payUrl,statusUrl,restartUrl,fetch:request=fetch,square}={}){
  for(const value of [sessionUrl,payUrl,statusUrl,...(restartUrl?[restartUrl]:[])])if(new URL(value,location.href).origin!==location.origin)throw new Error('Checkout endpoints must be same-origin');
  const announce=text=>{status.textContent=text;};status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  let busy=false,locked=false,destroyed=false;
  const json=async(url,options)=>{const response=await request(url,{credentials:'same-origin',...options});let data;try{data=await response.json();}catch{throw new Error('Checkout response unavailable');}if(!response.ok)throw Object.assign(new Error(data.error||'Checkout unavailable'),{code:data.error});return data;};
  const details=await json(sessionUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(session)});
  if(details.status.payments.some(payment=>!['failed','canceled'].includes(payment.status))){locked=true;button.disabled=true;announce('A payment already exists. Checking its status.');}
  const sdk=square||await loadSquare(details.environment),payments=sdk.payments(details.application_id,details.location_id),card=await payments.card();await card.attach(cardTarget);
  async function refresh(){const url=new URL(statusUrl,location.href);url.searchParams.set('order_id',details.session_id);const state=await json(url,{method:'GET'});const payment=state.payments.at(-1);announce(payment?.status==='completed'?'Payment received.':payment?`Payment status: ${payment.status}.`:'Ready for secure payment.');return state;}
  async function submit(event){
    event.preventDefault();if(busy||locked||destroyed)return;busy=true;button.disabled=true;announce('Processing secure payment…');
    let sent=false;
    try{
      const result=await card.tokenize({amount:details.amount,currencyCode:details.currency,intent:'CHARGE',customerInitiated:true,sellerKeyedIn:false});
      if(destroyed)return;
      if(result.status!=='OK'||!result.token){announce('Card verification did not complete. Please try again.');return;}
      sent=true;locked=true;
      const paid=await json(payUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({order_id:details.session_id,source_token:result.token})});
      announce(paid.status==='completed'?'Payment received.':'Payment is being confirmed. Do not submit another payment.');
    }catch(error){announce(sent?'Payment status needs confirmation. Do not submit another payment.':'Secure card entry is unavailable. Please try again.');}
    finally{busy=false;button.disabled=locked||destroyed;}
  }
  form.addEventListener('submit',submit);if(locked)await refresh();
  return {refresh,async restart(){
    if(!restartUrl||busy||destroyed)throw new Error('Checkout restart unavailable');busy=true;button.disabled=true;
    try{
      const state=await refresh();if(destroyed)throw new Error('Checkout restart unavailable');
      if(!state.payments.length||state.payments.some(payment=>!['failed','canceled'].includes(payment.status)))throw new Error('Payment status needs confirmation');
      await json(restartUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({order_id:details.session_id})});
      if(destroyed)return;locked=false;announce('Ready for a new payment attempt.');
    }finally{busy=false;button.disabled=locked||destroyed;}
  },async destroy(){if(destroyed)return;destroyed=true;locked=true;button.disabled=true;form.removeEventListener('submit',submit);await card.destroy();}};
}
