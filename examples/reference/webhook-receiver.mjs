import {durableWebhookHandler} from '@kujolang/commerce/runtime';

export const createHandler=({provider,secret,config,env,ingress,diagnostics})=>request=>durableWebhookHandler(request,{provider,secret,config,env,ingress,onDiagnostic:diagnostics,maxBodyBytes:1048576,archiveRaw:false});
