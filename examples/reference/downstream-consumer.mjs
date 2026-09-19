import {verifyDownstreamEvent} from '@kujolang/commerce';

export const createConsumer=({signingKeys,replayStore,applyBillingFact})=>async request=>{const event=await request.json();if(!await verifyDownstreamEvent({event,headers:request.headers},{keys:signingKeys,replayStore,toleranceSeconds:300}))return new Response('invalid signature',{status:401});await applyBillingFact(event);return new Response(null,{status:204});};
