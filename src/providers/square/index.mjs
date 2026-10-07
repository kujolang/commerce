import {base} from '../common.mjs';
import {publicFields} from '../../provider-utils.mjs';
import {squareRequest,SQUARE_VERSION} from './client.mjs';
import {invoiceMethods} from './invoices.mjs';
import {customerMethods,cardMethods} from './customers.mjs';
import {subscriptionMethods} from './subscriptions.mjs';
import {paymentMethods} from './payments.mjs';
import {checkoutMethods,ownedCheckoutMethods} from './checkout.mjs';
import {eventMethods} from './events.mjs';

export const squareProvider=base('square',{hosted_checkout:true,dynamic_checkout:true,multi_item_checkout:true,quantity:true,one_time:true,subscriptions:true,digital_products:true,physical_products:true,services:true,shipping:true,inventory:true,discounts:true,promotion_codes:true,tax:true,webhooks:true,refund_events:true,variants:true,localized_checkout:true,saved_payment_methods:true,static_recurring_prices:true,pause_resume:true,scheduled_cancellation:true,disputes:true,direct_reconciliation:true,direct_payments:true,manual_capture:true,refunds:true,owned_checkout:true,invoices:true},{
  ...invoiceMethods,...cardMethods,...paymentMethods,...ownedCheckoutMethods,...customerMethods,...subscriptionMethods,...checkoutMethods,...eventMethods,
  environment:['SQUARE_ACCESS_TOKEN','SQUARE_WEBHOOK_SIGNATURE_KEY'],
  validateConfig:config=>{const issues=[];if(!/^L[A-Z0-9]{10,}$/.test(config?.location_id||''))issues.push('Square requires providers.square.location_id.');if(config?.api_base&&!['https://connect.squareup.com','https://connect.squareupsandbox.com'].includes(String(config.api_base).replace(/\/$/,'')))issues.push('api_base must be an official Square production or sandbox origin.');if(config?.api_version&&config.api_version!==SQUARE_VERSION)issues.push(`api_version must be the tested Square version ${SQUARE_VERSION}.`);return issues;},
  validateProduct:(product,settings)=>{if(product.type==='subscription'){const issues=[];if(!/^[-A-Z0-9]{6,}$/.test(settings?.plan_variation_id||''))issues.push('Square subscriptions require plan_variation_id.');if(product.cadence!=='monthly')issues.push('Square subscription support currently requires cadence: monthly.');return issues;}return/^[-A-Z0-9]{6,}$/.test(settings?.catalog_object_id||'')?[]:['Square requires catalog_object_id for each purchasable item.'];},toPublicProduct:settings=>publicFields(settings,['catalog_object_id','plan_variation_id']),
  verifyRemote:async(product,config,env,context={})=>{const id=product.type==='subscription'?product.providers.square.plan_variation_id:product.providers.square.catalog_object_id;const response=await squareRequest(`/v2/catalog/object/${encodeURIComponent(id)}`,{},config,env,context);const remote=await response.json();return{sku:product.sku,source:product.source,status:remote.object?.is_deleted?'error':'ok',message:remote.object?.is_deleted?'Square catalog object is deleted.':'Square catalog object exists.'};},
  reconcileObject:async({type,id},config,env,context={})=>{const method={subscription:'retrieveSubscription',payment:'retrievePayment',refund:'retrieveRefund',invoice:'retrieveInvoice'}[type];if(!method)throw new Error('Unsupported Square reconciliation object');return squareProvider[method](id,config,env,context);},
  dashboardUrl:({type,id})=>type==='subscription'?`https://squareup.com/dashboard/subscriptions/${encodeURIComponent(id)}`:null,
});
