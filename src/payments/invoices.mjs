import {scopedProviderConfig} from './model.mjs';
import {createCommandExecutor} from './commands.mjs';
import {fail,equalIntent,money} from './model.mjs';
import {safeUrl} from '../provider-utils.mjs';
const summary=value=>({id:value.id,status:value.status,version:value.version,order_id:value.order_id,location_id:value.location_id,public_url:value.public_url?safeUrl(value.public_url):null,payment_requests:(value.payment_requests||[]).map(request=>({uid:request.uid,request_type:request.request_type,due_date:request.due_date,total_completed_amount_money:request.total_completed_amount_money||null}))});
export function createInvoiceService({store,scope,provider,config,env={},context={}}){
  config=scopedProviderConfig(scope,config);
  const execute=createCommandExecutor({store,scope});
  return Object.freeze({
    async draft({orderId,approvalId,customerId,dueDate,depositAmount=0,depositDueDate=dueDate,title='Invoice'}){
      const order=await store.get(scope,orderId);if(!order||order.state!=='open')throw fail('order_not_open');
      if(!approvalId||!customerId||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate||'')||!/^\d{4}-\d{2}-\d{2}$/.test(depositDueDate||'')||!Number.isSafeInteger(depositAmount)||depositAmount<0||depositAmount>=order.intent.total.amount)throw fail('invalid_collection_intent');
      const remoteOrder=await execute({orderId,id:approvalId,type:'invoice.order.create',intent:{customer_id:customerId,order_intent:order.intent},retrySafe:true,validate:current=>{if(current.state!=='open'||current.collection_reference&&current.collection_reference!==approvalId||current.active_payment_id||current.collection_route&&current.collection_route!=='invoice')throw fail('payment_unresolved');current.collection_route='invoice';current.collection_reference=approvalId;},mutate:operation=>provider.createOrder({lines:order.intent.lines,reference_id:operation.correlation_id,customer_id:customerId},config,env,{...context,idempotencyKey:operation.key}),project:value=>{equalIntent(money(value.total_money),order.intent.total);if(value.location_id!==scope.location_id)throw fail('location_mismatch');return {id:value.id,money:money(value.total_money)};}});
      const requests=[...(depositAmount?[{request_type:'DEPOSIT',due_date:depositDueDate,fixed_amount_requested_money:{amount:depositAmount,currency:order.intent.total.currency}}]:[]),{request_type:'BALANCE',due_date:dueDate}];
      return execute({orderId,id:approvalId,type:'invoice.create',intent:{order_id:remoteOrder.id,customer_id:customerId,payment_requests:requests,title:String(title).slice(0,128)},retrySafe:true,mutate:operation=>provider.createInvoice(operation.intent,config,env,{...context,idempotencyKey:operation.key}),project:summary});
    },
    async publish({orderId,operationId,invoiceId,version}){
      return execute({orderId,id:operationId,type:'invoice.publish',intent:{invoice_id:invoiceId,version},retrySafe:true,validate:order=>{if(!Object.values(order.operations).some(operation=>operation.type==='invoice.create'&&operation.result?.id===invoiceId))throw fail('invoice_not_bound');},mutate:operation=>provider.publishInvoice(invoiceId,{version},config,env,{...context,idempotencyKey:operation.key}),project:summary});
    },
    async cancel({orderId,operationId,invoiceId,version}){
      return execute({orderId,id:operationId,type:'invoice.cancel',intent:{invoice_id:invoiceId,version},validate:order=>{if(!Object.values(order.operations).some(operation=>operation.type==='invoice.create'&&operation.result?.id===invoiceId))throw fail('invoice_not_bound');},mutate:()=>provider.cancelInvoice(invoiceId,{version},config,env,context),project:summary});
    },
    async retrieve({orderId,invoiceId}){
      const order=await store.get(scope,orderId);if(!order||!Object.values(order.operations).some(operation=>operation.type==='invoice.create'&&operation.result?.id===invoiceId))throw fail('invoice_not_bound');
      const value=await provider.retrieveInvoice(invoiceId,config,env,context);if(value.location_id!==scope.location_id)throw fail('location_mismatch');
      const bound=Object.values(order.operations).find(operation=>operation.type==='invoice.create'&&operation.result?.id===invoiceId);if(value.id!==invoiceId||value.order_id!==bound.intent.order_id)throw fail('invoice_reference_mismatch');
      const paid=(value.payment_requests||[]).reduce((amount,request)=>{const completed=request.total_completed_amount_money;if(!completed)return amount;if(completed.currency!==order.intent.total.currency||!Number.isSafeInteger(completed.amount)||completed.amount<0)throw fail('invoice_money_mismatch');return amount+completed.amount;},0);
      if(!Number.isSafeInteger(paid)||paid>order.intent.total.amount||value.status==='PAID'&&paid!==order.intent.total.amount)throw fail('invoice_money_mismatch');
      if(!Number.isSafeInteger(value.version)||value.version<0)throw fail('invoice_version_required');
      return store.transact(scope,orderId,async tx=>{
        if(tx.order.invoice?.version>=value.version)return tx.order.invoice;
        if(tx.order.invoice?.status==='PAID'&&value.status!=='PAID')throw fail('invoice_state_conflict');
        const invoice={...summary(value),paid_money:{amount:paid,currency:order.intent.total.currency}};
        tx.order.invoice=invoice;tx.order.version++;
        await tx.emit({schema:'kujo-commerce-downstream-event/v1',schema_version:1,event_id:crypto.randomUUID(),aggregate_id:orderId,aggregate_version:tx.order.version,type:'invoice.observed',occurred_at:new Date().toISOString(),offer_revision:order.intent.offer_revision,customer_reference:order.intent.customer_id,status:tx.order.state,data:{scope,invoice}});
        return invoice;
      });
    }
  });
}
