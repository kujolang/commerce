export function createOperatorService({authorize=async()=>false,audit=async()=>{},receipts,queue,deadLetters,reconciliation,replayController,providers={}}={}){
  const requireAuth=async(actor,action,resource)=>{if(!(await authorize({actor,action,resource})))throw new Error('operator action is not authorized');};
  return Object.freeze({
    async inspect({kind,id}){if(kind==='webhook_receipt')return receipts?.get(id);if(kind==='job')return queue?.get(id);if(kind==='dead_letter')return deadLetters?.get(id);if(kind==='drift')return reconciliation?.listFindings();throw new Error('unsupported operator inspection');},
    async replay({id,actor,request_id}){await requireAuth(actor,'event.replay',id);const result=await replayController.replay(id,actor);await audit({action:'event.replay',actor,resource:id,request_id,result_id:result.id,occurred_at:new Date().toISOString()});return result;},
    async providerLink({provider,type,id}){const builder=providers[provider]?.dashboardUrl;if(typeof builder!=='function')return null;return builder({type,id});}
  });
}
