import {durableWebhookHandler} from '@kujolang/commerce/runtime';

export const createHandler=({provider,secret,config,env,receiptStore,queue,diagnostics})=>request=>durableWebhookHandler(request,{provider,secret,config,env,receiptStore,queue,onDiagnostic:diagnostics,maxBodyBytes:1048576,archiveRaw:false});
