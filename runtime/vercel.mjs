import { toWebRequest, sendWebResponse } from './node.mjs';
export const vercelHandler=handler=>async(request,response)=>sendWebResponse(await handler(await toWebRequest(request,{origin:`https://${request.headers.host}`})),response);
