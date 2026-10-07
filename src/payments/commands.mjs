import {scopeOf,scopeKey,beginOperation,claimOperation,assertFence,operationKey,fail} from './model.mjs';

// Internal command boundary for non-payment capabilities attached to an owned
// order. Callers must construct an allowlisted intent and result projection.
export function createCommandExecutor({store,scope:inputScope,now=Date.now,leaseMs=30000}){
  const scope=scopeOf(inputScope);
  const audit=async(tx,type,operation)=>{tx.order.version++;tx.order.updated_at=new Date(now()).toISOString();await tx.emit({schema:'kujo-commerce-downstream-event/v1',schema_version:1,event_id:crypto.randomUUID(),aggregate_id:tx.order.id,aggregate_version:tx.order.version,type,occurred_at:tx.order.updated_at,offer_revision:tx.order.intent.offer_revision,customer_reference:tx.order.intent.customer_id,status:tx.order.state,data:{scope,operation_id:operation.id,operation_type:operation.type}});};
  return async({orderId,id,type,intent,validate=()=>{},mutate,project,retrySafe=false})=>{
    const prepared=await store.transact(scope,orderId,async tx=>{
      if(!tx.order||scopeKey(tx.order.scope)!==scopeKey(scope))throw fail('order_not_found');await validate(tx.order);
      const operation=beginOperation(tx.order,{id,type,intent});if(operation.state==='succeeded')return {cached:true,operation};if(operation.state==='failed')throw fail('operation_failed');
      const ticket=claimOperation(operation,{now:now(),leaseMs,reconcile:retrySafe});await audit(tx,`${type}.submitted`,operation);return {operation:structuredClone(operation),ticket};
    });
    if(prepared.cached)return prepared.operation.result;
    const {operation,ticket}=prepared;
    try{
      const result=project(await mutate(operation));
      return await store.transact(scope,orderId,async tx=>{const current=tx.order.operations[operationKey(type,id)];assertFence(current,ticket);current.result=result;current.state='succeeded';delete current.token;delete current.lease_until;await audit(tx,`${type}.succeeded`,current);return result;});
    }catch(error){await store.transact(scope,orderId,async tx=>{const current=tx.order.operations[operationKey(type,id)];assertFence(current,ticket);current.state='unknown';current.error_code='provider_outcome_unknown';delete current.token;delete current.lease_until;await audit(tx,`${type}.unknown`,current);});throw error;}
  };
}
