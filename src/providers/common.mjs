export const caps = values => Object.freeze({
  hosted_checkout:false, dynamic_checkout:false, multi_item_checkout:false, quantity:false,
  one_time:false, subscriptions:false, digital_products:false, physical_products:false,
  services:false, shipping:false, inventory:false, discounts:false, promotion_codes:false,
  tax:false, customer_portal:false, webhooks:false, refund_events:false, entitlements:false,
  variants:false, localized_checkout:false, merchant_of_record:false,
  saved_payment_methods:false,trials:false,multiple_phases:false,static_recurring_prices:false,relative_recurring_prices:false,
  plan_changes:false,pause_resume:false,scheduled_cancellation:false,immediate_cancellation:false,disputes:false,
  event_recovery:false,direct_reconciliation:false,...values
});

export const event = (provider, input, typeMap, object = input.data?.object || input.data || input.resource || {}) => {
  const metadata = object.metadata || object.custom_data || input.meta?.custom_data || {};
  const skus = Array.isArray(metadata.skus) ? metadata.skus : Object.keys(metadata).filter(key => key.startsWith('sku_')).sort().map(key => metadata[key]).filter(Boolean);
  const rawTime = input.created || input.create_time || input.occurred_at || input.created_at || input.timestamp || Date.now();
  const timestamp = typeof rawTime === 'number' ? new Date(rawTime > 1e12 ? rawTime : rawTime * 1000) : new Date(rawTime);
  return {
    schema:'kujo-commerce-event/v1', event_version:1, provider,
    type:typeMap[input.type || input.event_type || input.meta?.event_name] || 'commerce.unknown',
    provider_event_id:String(input.id || input.event_id || input.meta?.event_id || ''),
    provider_object_id:String(object.id || input.data?.id || ''), skus,
    timestamp:Number.isNaN(timestamp.valueOf()) ? new Date().toISOString() : timestamp.toISOString()
  };
};

export const base = (id, capabilities, overrides = {}) => ({
  id, version:'1.0.0', capabilities:caps(capabilities), environment:[],
  validateConfig:() => [], validateProduct:() => [], toPublicProduct:() => ({}),
  verifyRemote:async product => ({ sku:product.sku, source:product.source, status:'ok', message:`${id} configuration is locally valid.` }),
  completeCheckout:async () => { throw new Error(`${id} does not require server-side checkout completion`); },
  createCustomerPortal:async () => null,
  validateWebhookConfig:({secret}) => capabilities.webhooks&&!secret?['webhook secret is not configured']:[],
  verifyWebhook:async () => false,
  normalizeWebhookEvent:input => event(id, input, {}), ...overrides
});

