import {money,fail} from './model.mjs';
import {assertStableId} from '../contracts.mjs';

export function quoteApplicationFee(policy,total,scope){
  if(!policy?.enabled)return null;
  money(total);
  if(!policy.approval_reference||!policy.merchant_consent_reference||policy.provider_merchant_id!==scope.provider_merchant_id||policy.environment!==scope.environment||!policy.permissions?.includes('PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS'))throw fail('fee_policy_not_authorized');
  if(!Number.isSafeInteger(policy.basis_points)||policy.basis_points<0||policy.basis_points>6000||!Number.isSafeInteger(policy.fixed_amount||0)||(policy.fixed_amount||0)<0)throw fail('invalid_fee_policy');
  const amount=Number(BigInt(total.amount)*BigInt(policy.basis_points)/10000n+BigInt(policy.fixed_amount||0));
  // Conservative policy ceiling valid below and above Square's thresholds.
  // This is an application fee limit, never an assumed processing fee rate.
  if(!Number.isSafeInteger(amount)||amount>Number(BigInt(total.amount)*60n/100n))throw fail('fee_exceeds_policy_limit');
  if(!amount)return null;
  const recipients=policy.recipients;
  if(!Array.isArray(recipients)||!recipients.length||recipients.length>2||new Set(recipients.map(value=>value.location_id)).size!==recipients.length||!recipients.some(value=>value.location_id===policy.developer_location_id))throw fail('invalid_fee_recipients');
  if(recipients.reduce((sum,value)=>sum+value.basis_points,0)!==10000)throw fail('invalid_fee_allocation');
  let remaining=amount;
  const allocations=recipients.map((recipient,index)=>{
    if(!Number.isInteger(recipient.basis_points)||recipient.basis_points<0||recipient.basis_points>10000||recipient.country!==policy.seller_country||recipient.currency!==total.currency||!recipient.country||!recipient.permissions?.includes('PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS'))throw fail('fee_recipient_not_authorized');
    const share=index===recipients.length-1?remaining:Number(BigInt(amount)*BigInt(recipient.basis_points)/10000n);remaining-=share;
    return {location_id:assertStableId(recipient.location_id),amount_money:{amount:share,currency:total.currency}};
  });
  return {policy_id:assertStableId(policy.id),approval_reference:assertStableId(policy.approval_reference),merchant_consent_reference:assertStableId(policy.merchant_consent_reference),amount_money:{amount,currency:total.currency},allocations};
}
export function providerFinancials(value){
  const signed=value=>{if(!Number.isSafeInteger(value?.amount)||!/^[A-Z]{3}$/.test(value?.currency||''))throw fail('invalid_provider_fee');return {amount:value.amount,currency:value.currency};};
  return {
    application_fee:value.app_fee_money?signed(value.app_fee_money):null,
    allocations:(value.app_fee_allocations||[]).map(allocation=>({location_id:assertStableId(allocation.location_id),amount_money:signed(allocation.amount_money)})),
    processing_fees:(value.processing_fee||[]).map(fee=>({type:String(fee.type),effective_at:fee.effective_at,amount_money:signed(fee.amount_money)}))
  };
}
