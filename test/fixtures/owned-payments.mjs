export const scope={merchant_id:'merchant',connection_id:'connection',provider:'square',environment:'sandbox',provider_merchant_id:'SELLER',location_id:'LOCATION'};
export const input={id:'order',scope,customer_id:'customer',offer_revision:'revision',lines:[{sku:'item',quantity:2,price:{amount:500,currency:'USD'}}]};
export function squareFixture(){
  const calls=[],payments=new Map(),refunds=new Map();let loseResponse=false,decline=false;
  const fetch=async(url,options)=>{
    const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):{};calls.push({path,body});let value={};
    if(path==='/v2/payments'&&options.method==='POST'){
      if(decline)return new Response(JSON.stringify({errors:[{code:'CARD_DECLINED',detail:'private provider diagnostic'}]}),{status:400});
      if(!payments.has(body.idempotency_key))payments.set(body.idempotency_key,{id:`payment-${payments.size+1}`,status:body.autocomplete?'COMPLETED':'APPROVED',amount_money:body.amount_money,reference_id:body.reference_id,location_id:body.location_id,updated_at:'2026-10-07T10:00:00Z',version_token:'opaque-v1'});
      value={payment:payments.get(body.idempotency_key)};if(loseResponse){loseResponse=false;throw new Error('token-source-should-not-leak');}
    }else if(path==='/v2/payments')value={payments:[...payments.values()]};
    else if(/^\/v2\/payments\/[^/]+\/(complete|cancel)$/.test(path)){
      const payment=[...payments.values()].find(row=>row.id===path.split('/')[3]);payment.status=path.endsWith('complete')?'COMPLETED':'CANCELED';payment.updated_at='2026-10-07T11:00:00Z';value={payment};
    }else if(path.startsWith('/v2/payments/'))value={payment:[...payments.values()].find(row=>row.id===path.split('/').at(-1))};
    else if(path==='/v2/refunds'&&options.method==='POST'){
      if(!refunds.has(body.idempotency_key))refunds.set(body.idempotency_key,{id:`refund-${refunds.size+1}`,payment_id:body.payment_id,status:'PENDING',amount_money:body.amount_money,location_id:'LOCATION',updated_at:'2026-10-07T11:00:00Z'});value={refund:refunds.get(body.idempotency_key)};
    }else if(path.startsWith('/v2/refunds/'))value={refund:[...refunds.values()].find(row=>row.id===path.split('/').at(-1))};
    else if(path==='/v2/online-checkout/payment-links')value={payment_link:{id:'link',order_id:'square-order',url:'https://square.link/test'},related_resources:{orders:[{id:'square-order',total_money:{amount:1000,currency:'USD'}}]}};
    else throw new Error(`Unimplemented fixture ${path}`);
    return new Response(JSON.stringify(value),{headers:{'x-request-id':'request-fixture'}});
  };
  return {fetch,calls,payments,refunds,lose:()=>{loseResponse=true;},decline:()=>{decline=true;}};
}
