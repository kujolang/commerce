const METHODS=['validateConfig','validateProduct','toPublicProduct','verifyRemote','createCheckout','completeCheckout','createCustomerPortal','validateWebhookConfig','verifyWebhook','normalizeWebhookEvent'];
const CAPABILITIES=['hosted_checkout','dynamic_checkout','multi_item_checkout','quantity','one_time','subscriptions','digital_products','physical_products','services','shipping','inventory','discounts','promotion_codes','tax','customer_portal','webhooks','refund_events','entitlements','variants','localized_checkout','merchant_of_record','saved_payment_methods','trials','multiple_phases','static_recurring_prices','relative_recurring_prices','plan_changes','pause_resume','scheduled_cancellation','immediate_cancellation','disputes','event_recovery','direct_reconciliation'];

export function providerConformance(provider){
  const issues=[];
  if(!provider||!/^[a-z][a-z0-9-]{0,63}$/.test(provider.id||''))issues.push('id must be a stable lowercase identifier');
  if(!/^\d+\.\d+\.\d+$/.test(provider?.version||''))issues.push('version must be semantic');
  for(const method of METHODS)if(typeof provider?.[method]!=='function')issues.push(`missing ${method}()`);
  for(const capability of CAPABILITIES)if(typeof provider?.capabilities?.[capability]!=='boolean')issues.push(`capability ${capability} must be boolean`);
  if(provider?.capabilities?.dynamic_checkout&&!provider.capabilities.hosted_checkout)issues.push('dynamic checkout providers must return a hosted checkout destination');
  if(provider?.capabilities?.refund_events&&!provider.capabilities.webhooks)issues.push('refund_events requires webhooks');
  if(provider?.capabilities?.pause_resume&&(!provider.capabilities.subscriptions||typeof provider.pauseSubscription!=='function'||typeof provider.resumeSubscription!=='function'))issues.push('pause_resume requires subscription pause and resume methods');
  if(provider?.capabilities?.direct_reconciliation&&typeof provider.reconcileObject!=='function')issues.push('direct_reconciliation requires reconcileObject()');
  return issues;
}

export function assertProviderConformance(provider){const issues=providerConformance(provider);if(issues.length)throw new Error(`Provider ${provider?.id||'(unknown)'} failed conformance:\n- ${issues.join('\n- ')}`);return true;}
