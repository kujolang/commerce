import {checkoutHandler} from '@kujolang/commerce/runtime';

export const createHandler=({catalog,config,env,fetch,rateLimiter})=>request=>checkoutHandler(request,{catalog,config,env,fetch,rateLimiter});
