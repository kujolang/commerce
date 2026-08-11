export const capabilities = Object.freeze({
  stripe: { hosted_checkout:true, dynamic_checkout:true, multi_item_checkout:true, quantity:true, one_time:true, subscriptions:true, digital_products:true, physical_products:true, services:true, shipping:true, discounts:true, customer_portal:true, webhooks:true },
  polar: { hosted_checkout:true, dynamic_checkout:true, multi_item_checkout:false, quantity:false, one_time:true, subscriptions:true, digital_products:true, physical_products:false, services:true, shipping:false, discounts:true, customer_portal:true, webhooks:true },
  link: { hosted_checkout:true, dynamic_checkout:false, multi_item_checkout:false, quantity:false, one_time:true, subscriptions:true, digital_products:true, physical_products:true, services:true, shipping:false, discounts:false, customer_portal:false, webhooks:false },
  mock: { hosted_checkout:true, dynamic_checkout:true, multi_item_checkout:true, quantity:true, one_time:true, subscriptions:true, digital_products:true, physical_products:true, services:true, shipping:true, discounts:true, customer_portal:true, webhooks:true }
});

export const providerFor = id => {
  if (!capabilities[id]) throw new Error(`Unknown Commerce provider: ${id}`);
  return { id, capabilities: capabilities[id] };
};
