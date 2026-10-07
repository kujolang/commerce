import {event} from '../common.mjs';
import {hmacSha256,timingSafeEqual} from '../../provider-utils.mjs';

const squareEvents={'payment.created':'commerce.payment.created','payment.updated':'commerce.payment.updated','order.created':'commerce.order.created','order.updated':'commerce.order.updated','refund.created':'commerce.refund.created','refund.updated':'commerce.refund.updated','subscription.created':'commerce.subscription.created','subscription.updated':'commerce.subscription.updated','invoice.payment_made':'commerce.payment.succeeded','invoice.scheduled_charge_failed':'commerce.payment.failed','dispute.created':'commerce.dispute.created','dispute.state_changed':'commerce.dispute.updated'};

export const eventMethods={
  verifyWebhook:async({raw,request,secret,config})=>{if(!secret||!config.notification_url)return false;const expected=await hmacSha256(secret,`${config.notification_url}${raw}`,'base64');return timingSafeEqual(expected,request.headers.get('x-square-hmacsha256-signature'));},normalizeWebhookEvent:input=>{const object=input.data?.object||{},map=Object.assign(Object.create(null),squareEvents);if(input.type==='payment.updated'&&object.payment?.status==='COMPLETED')map[input.type]='commerce.checkout.completed';return event('square',{...input,type:input.type||'unknown'},map,object.subscription||object.payment||object.refund||object.dispute||object.invoice||object);}
};
