import {scopeKey,fail} from './model.mjs';

export async function reconcileOwnedOrders({store,service,cursor=null,limit=50,maxOperations=100,onOtherOperation}={}){
  limit=Math.max(1,Math.min(100,limit));maxOperations=Math.max(1,Math.min(1000,maxOperations));
  const afterId=cursor?.order_id||'',orders=[];
  if(cursor?.operation_key){const current=await store.get(service.scope,afterId);if(current)orders.push(current);}
  const page=await store.list(service.scope,{afterId,limit});orders.push(...page);const results=[];
  for(const order of orders){
    for(const [key,operation] of Object.entries(order.operations).sort(([a],[b])=>a.localeCompare(b))){
      if(order.id===cursor?.order_id&&cursor.operation_key&&key.localeCompare(cursor.operation_key)<=0)continue;
      if(operation.state==='failed'||operation.state==='ready')continue;
      if(!['payment.create','payment.capture','payment.cancel','refund.create'].includes(operation.type)){
        if(onOtherOperation)results.push(await onOtherOperation({order,operation}));
      }else{
        try{results.push({order_id:order.id,operation_id:operation.id,result:await service.reconcile({orderId:order.id,attemptId:operation.id,type:operation.type})});}
        catch(error){results.push({order_id:order.id,operation_id:operation.id,status:'unresolved',code:error.code||'reconciliation_unavailable'});}
      }
      if(results.length>=maxOperations)return {results,next_cursor:{order_id:order.id,operation_key:key},truncated:true};
    }
  }
  return {results,next_cursor:page.length===limit?{order_id:page.at(-1).id,operation_key:null}:null,truncated:false};
}

// At-least-once publication. Consumers deduplicate immutable event IDs; scope is
// included in the signed payload, and no delivery can erase financial history.
export async function publishPaymentOutbox({store,scope,publisher,limit=100}){
  scopeKey(scope);const outcomes=[];
  for(const row of (await store.outbox(scope,{pending:true,limit})).filter(value=>value.state==='pending').slice(0,limit)){
    try{await publisher.publish(row.event);await store.delivered(scope,row.event.event_id);outcomes.push({event_id:row.event.event_id,status:'delivered'});}
    catch{outcomes.push({event_id:row.event.event_id,status:'retrying'});}
  }
  return outcomes;
}
export function assertDeploymentManifest(manifest){
  if(manifest?.schema!=='kujo-commerce-deployment/v1'||typeof manifest.authorizeOperator!=='function'||typeof manifest.audit!=='function'||!manifest.service||!manifest.store)throw fail('invalid_deployment_manifest');return manifest;
}
