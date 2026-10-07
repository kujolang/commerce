import {createCommandExecutor} from '../payments/commands.mjs';
import {scopedProviderConfig,equalIntent,money,fail,operationKey} from '../payments/model.mjs';
import {squareJson} from '../providers/square/client.mjs';

export function createTerminalService({store,service,provider,config={},env={},context={},enabled=false,resolveDevice}={}){
  const scope=service.scope;config=scopedProviderConfig(scope,config);const execute=createCommandExecutor({store,scope});
  const check=()=>{if(!enabled)throw fail('integration_disabled');};
  const terminal={
    async checkout({orderId,operationId,deviceId,actor}){
      check();const device=await resolveDevice?.({scope,deviceId,actor});if(!actor||!device?.paired||device.id!==deviceId||device.merchant_id!==scope.merchant_id||device.location_id!==scope.location_id)throw fail('paired_device_authorization_required');
      const order=await store.get(scope,orderId);if(!order)throw fail('order_not_found');
      return execute({orderId,id:operationId,type:'terminal.checkout',intent:{device_id:deviceId,money:order.intent.total},retrySafe:true,validate:current=>{
        if(current.state!=='open'||current.active_payment_id&&!current.operations[operationKey('terminal.checkout',operationId)]||current.collection_reference&&current.collection_reference!==operationId||current.collection_route&&current.collection_route!=='terminal')throw fail('payment_unresolved');current.collection_route='terminal';current.collection_reference=operationId;
      },mutate:async operation=>{
        const value=(await squareJson('/v2/terminals/checkouts',{idempotency_key:operation.key,checkout:{amount_money:operation.intent.money,reference_id:operation.correlation_id,device_options:{device_id:deviceId,tip_settings:{allow_tipping:false}}}},config,env,context)).checkout;
        if(value.location_id!==scope.location_id)throw fail('location_mismatch');equalIntent(money(value.amount_money),operation.intent.money);return {...value,local_id:operation.correlation_id};
      },project:value=>({id:value.id,local_id:value.local_id,status:value.status,location_id:value.location_id}),apply:async(tx,result,operation)=>{
        tx.order.payments[result.local_id]={schema:'kujo-commerce-payment/v1',schema_version:1,id:result.local_id,order_id:orderId,status:'pending',mode:'terminal',money:operation.intent.money};tx.order.active_payment_id=result.local_id;
      }});
    },
    async reconcile({orderId,operationId}){
      check();const order=await store.get(scope,orderId),operation=order?.operations[operationKey('terminal.checkout',operationId)];if(!operation?.result)throw fail('terminal_reference_unknown');
      const value=(await squareJson(`/v2/terminals/checkouts/${encodeURIComponent(operation.result.id)}`,undefined,config,env,context,'GET')).checkout;
      if(value.location_id!==scope.location_id)throw fail('location_mismatch');equalIntent(money(value.amount_money),order.intent.total);
      if(value.status==='COMPLETED'){
        if(value.payment_ids?.length!==1)throw fail('ambiguous_terminal_payment');
        const payment=await provider.retrievePayment(value.payment_ids[0],config,env,context);
        return service.observe({orderId,localId:operation.result.local_id,observation:provider.paymentObservation(payment,scope)});
      }
      if(value.status==='CANCELED')return store.transact(scope,orderId,async tx=>{const payment=tx.order.payments[operation.result.local_id];if(payment.provider_id||payment.status==='completed')throw fail('terminal_state_conflict');if(payment.status==='canceled')return {status:'canceled'};payment.status='canceled';tx.order.collection_route=null;tx.order.collection_reference=null;tx.order.version++;await tx.emit({schema:'kujo-commerce-downstream-event/v1',schema_version:1,event_id:crypto.randomUUID(),aggregate_id:orderId,aggregate_version:tx.order.version,type:'payment.canceled',occurred_at:new Date().toISOString(),offer_revision:tx.order.intent.offer_revision,customer_reference:tx.order.intent.customer_id,status:tx.order.state,data:{scope,payment_id:payment.id}});return {status:'canceled'};});
      return {status:'pending'};
    },
    async cancel({orderId,operationId,cancelOperationId}){
      check();const order=await store.get(scope,orderId),operation=order?.operations[operationKey('terminal.checkout',operationId)];if(!operation?.result)throw fail('terminal_reference_unknown');
      await execute({orderId,id:cancelOperationId,type:'terminal.cancel',intent:{checkout_id:operation.result.id},mutate:()=>squareJson(`/v2/terminals/checkouts/${encodeURIComponent(operation.result.id)}/cancel`,{},config,env,context),project:value=>({id:value.checkout.id,status:value.checkout.status})});
      return terminal.reconcile({orderId,operationId});
    }
  };return Object.freeze(terminal);
}
