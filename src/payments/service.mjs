import {createOrder,scopeOf,equalIntent,fail,beginOperation,claimOperation,assertFence,operationKey,assertObservation,applyObservation,refundable,money,transitionOrder} from './model.mjs';

export function createPaymentService({store,provider,scope:inputScope,config={},env={},context={},now=Date.now,leaseMs=30000}={}){
  const scope=scopeOf(inputScope);
  if(!store?.transact||provider?.id!==scope.provider)throw fail('invalid_payment_service');
  // Deployment binds credentials to this scope. Config cannot silently redirect
  // an operation to another environment/location after its intent is frozen.
  if(config.location_id!==scope.location_id)throw fail('location_mismatch');
  const expectedBase=scope.environment==='sandbox'?'https://connect.squareupsandbox.com':'https://connect.squareup.com';
  if(scope.provider==='square'&&(config.api_base||expectedBase).replace(/\/$/,'')!==expectedBase)throw fail('environment_mismatch');
  const providerConfig={...config,...(scope.provider==='square'?{api_base:expectedBase}:{})};
  const timestamp=()=>new Date(now()).toISOString();
  const required=tx=>{if(!tx.order)throw fail('order_not_found');return tx.order;};
  const audit=async(tx,type,data={})=>{
    tx.order.version++;tx.order.updated_at=timestamp();
    await tx.emit({schema:'kujo-commerce-downstream-event/v1',schema_version:1,event_id:crypto.randomUUID(),aggregate_id:tx.order.id,aggregate_version:tx.order.version,type,occurred_at:timestamp(),offer_revision:tx.order.intent.offer_revision,customer_reference:tx.order.intent.customer_id,status:tx.order.state,data:{scope,...data}});
  };
  const recordObservation=async(tx,localId,observation)=>{
    const order=required(tx),collection=observation.kind==='payment'?order.payments:order.refunds,record=Object.hasOwn(collection,localId)?collection[localId]:null;
    if(!record)throw fail('local_reference_not_found');assertObservation(scope,observation,record.money);
    if(observation.kind==='refund'&&observation.payment_id!==order.payments[record.payment_id]?.provider_id)throw fail('refund_payment_mismatch');
    if(applyObservation(record,observation))await audit(tx,`${observation.kind}.${record.status}`,{local_id:localId,provider_id:record.provider_id,money:record.money});
    return record;
  };
  async function finish(orderId,operation,ticket,result,observation){
    return store.transact(scope,orderId,async tx=>{
      const current=required(tx).operations[operationKey(operation.type,operation.id)];assertFence(current,ticket);
      if(observation)await recordObservation(tx,current.local_id,observation);
      // Only small allowlisted result fields enter storage, never raw provider bodies.
      current.state='succeeded';current.result=result;delete current.token;delete current.lease_until;
      await audit(tx,'operation.succeeded',{operation_id:current.id,operation_type:current.type});return result;
    });
  }
  async function uncertain(orderId,operation,ticket,error){
    await store.transact(scope,orderId,async tx=>{
      const current=required(tx).operations[operationKey(operation.type,operation.id)];assertFence(current,ticket);
      current.state=error.definitive===true?'failed':'unknown';current.error_code=error.code||'provider_outcome_unknown';delete current.token;delete current.lease_until;
      const record=current.type==='refund.create'?tx.order.refunds[current.local_id]:current.type==='payment.create'?tx.order.payments[current.local_id]:null;
      if(record&&error.definitive===true)record.status='failed';
      await audit(tx,`operation.${current.state}`,{operation_id:current.id,operation_type:current.type,code:current.error_code});
    });
  }
  async function execute(prepared,mutate,project){
    if(prepared.cached)return prepared.operation.result;
    const {orderId,operation,ticket}=prepared;
    try{const remote=await mutate(operation),{result,observation}=project(remote);return await finish(orderId,operation,ticket,result,observation);}
    catch(error){try{await uncertain(orderId,operation,ticket,error);}catch(failure){if(failure.code!=='stale_operation')throw failure;}throw error;}
  }
  const api={
    scope,
    async create(input){const order=createOrder({...input,scope},{now:timestamp});return store.transact(scope,order.id,async tx=>{if(tx.order){equalIntent(tx.order.intent,order.intent);return tx.order;}tx.put(order);await audit(tx,'order.created');return order;});},
    get:id=>store.get(scope,id),
    async setOrderState(id,state){return store.transact(scope,id,async tx=>{tx.put(transitionOrder(required(tx),state));await audit(tx,`order.${state}`);return tx.order;});},
    async pay({orderId,attemptId,sourceToken,mode='embedded',autocomplete=true}){
      if(!['embedded','hosted'].includes(mode)||typeof autocomplete!=='boolean')throw fail('invalid_checkout_mode');
      const prepared=await store.transact(scope,orderId,async tx=>{
        const order=required(tx);if(order.collection_route==='invoice')throw fail('payment_unresolved');if(order.state!=='open')throw fail('order_not_open');
        const key=operationKey('payment.create',attemptId),existing=order.operations[key];
        if(!existing&&order.active_payment_id&&!['failed','canceled'].includes(order.payments[order.active_payment_id].status))throw fail('payment_unresolved');
        const operation=beginOperation(order,{id:attemptId,type:'payment.create',intent:{mode,autocomplete,order_intent:order.intent}});
        if(operation.state==='succeeded')return {cached:true,operation};
        if(operation.state==='failed')throw fail('operation_failed');
        if(mode==='embedded'&&operation.state==='ready'&&(typeof sourceToken!=='string'||!sourceToken||sourceToken.length>4096))throw fail('source_required');
        const ticket=claimOperation(operation,{now:now(),leaseMs});
        if(!operation.local_id){operation.local_id=operation.correlation_id;order.payments[operation.local_id]={schema:'kujo-commerce-payment/v1',schema_version:1,id:operation.local_id,order_id:order.id,status:'created',money:order.intent.total,mode};order.active_payment_id=operation.local_id;}
        order.collection_route=mode;await audit(tx,'payment.submitted',{local_id:operation.local_id});return {orderId,operation:structuredClone(operation),ticket};
      });
      return execute(prepared,operation=>mode==='hosted'?provider.createOwnedCheckout({lines:operation.intent.order_intent.lines,reference_id:operation.correlation_id},providerConfig,env,{...context,idempotencyKey:operation.key}):provider.createPayment({source_id:sourceToken,money:operation.intent.order_intent.total,reference_id:operation.correlation_id,autocomplete},providerConfig,env,{...context,idempotencyKey:operation.key}),remote=>{
        if(mode==='hosted'){equalIntent(prepared.operation.intent.order_intent.total,remote.money);return {result:{local_id:prepared.operation.local_id,checkout_url:remote.checkout_url,provider_reference:remote.provider_reference,provider_order_id:remote.provider_order_id}};}
        const observation=provider.paymentObservation(remote,scope);return {result:{local_id:prepared.operation.local_id,provider_id:observation.provider_id,status:observation.status},observation};
      });
    },
    async refund({orderId,paymentId,refundId,amount,reason=''}){
      const prepared=await store.transact(scope,orderId,async tx=>{
        const order=required(tx),payment=Object.hasOwn(order.payments,paymentId)?order.payments[paymentId]:null;if(!payment)throw fail('payment_not_found');
        const value=money({amount,currency:payment.money.currency});
        const existing=order.operations[operationKey('refund.create',refundId)];
        if(!existing&&refundable(order,paymentId)<amount)throw fail('refund_exceeds_available');
        const operation=beginOperation(order,{id:refundId,type:'refund.create',intent:{payment_id:payment.provider_id,local_payment_id:paymentId,money:value,reason:String(reason).slice(0,192),payment_version_token:existing?existing.intent.payment_version_token:payment.version_token||null}});
        if(operation.state==='succeeded')return {cached:true,operation};if(operation.state==='failed')throw fail('operation_failed');
        const ticket=claimOperation(operation,{now:now(),leaseMs});
        if(!operation.local_id){operation.local_id=crypto.randomUUID();order.refunds[operation.local_id]={schema:'kujo-commerce-refund/v1',schema_version:1,id:operation.local_id,order_id:order.id,payment_id:paymentId,money:value,status:'requested'};}
        await audit(tx,'refund.reserved',{local_id:operation.local_id,money:value});return {orderId,operation:structuredClone(operation),ticket};
      });
      return execute(prepared,operation=>provider.refundPayment(operation.intent,providerConfig,env,{...context,idempotencyKey:operation.key}),remote=>{const observation=provider.refundObservation(remote,scope);return {result:{local_id:prepared.operation.local_id,provider_id:observation.provider_id,status:observation.status},observation};});
    },
    async changePayment({orderId,paymentId,action,operationId}){
      if(!['capture','cancel'].includes(action))throw fail('invalid_payment_action');
      const prepared=await store.transact(scope,orderId,async tx=>{
        const order=required(tx),payment=Object.hasOwn(order.payments,paymentId)?order.payments[paymentId]:null;
        if(!payment?.provider_id)throw fail('payment_reference_required');
        const operation=beginOperation(order,{id:operationId,type:`payment.${action}`,intent:{payment_id:payment.provider_id,action}});
        if(operation.state==='succeeded')return {cached:true,operation};
        if(payment.status!=='authorized')throw fail('payment_not_authorized');
        const ticket=claimOperation(operation,{now:now(),leaseMs});operation.local_id=paymentId;
        await audit(tx,`payment.${action}_submitted`,{local_id:paymentId});return {orderId,operation:structuredClone(operation),ticket};
      });
      return execute(prepared,async operation=>{
        const current=await provider.retrievePayment(operation.intent.payment_id,providerConfig,env,context);
        const desired=action==='capture'?'COMPLETED':'CANCELED';
        if(current.status===desired)return current;
        if(current.status!=='APPROVED')throw fail('provider_state_conflict');
        return action==='capture'?provider.completePayment(current.id,{version_token:current.version_token},providerConfig,env,context):provider.cancelPayment(current.id,providerConfig,env,context);
      },remote=>{const observation=provider.paymentObservation(remote,scope);return {result:{local_id:paymentId,provider_id:observation.provider_id,status:observation.status},observation};});
    },
    async recoverRefundReference({orderId,refundId,providerId,actor,evidenceReference}){
      if(!actor||!evidenceReference)throw fail('recovery_evidence_required');
      const observation=provider.refundObservation(await provider.retrieveRefund(providerId,providerConfig,env,context),scope);
      return store.transact(scope,orderId,async tx=>{
        const operation=required(tx).operations[operationKey('refund.create',refundId)];
        if(!operation||operation.state!=='unknown')throw fail('operation_not_unknown');
        const record=await recordObservation(tx,operation.local_id,observation);
        operation.state='succeeded';operation.result={local_id:record.id,provider_id:record.provider_id,status:record.status};
        await audit(tx,'refund.recovered_by_operator',{local_id:record.id,actor:String(actor).slice(0,256),evidence_reference:String(evidenceReference).slice(0,256)});return operation.result;
      });
    },
    async observe({orderId,localId,observation,receipt}){return store.transact(scope,orderId,async tx=>{const result=await recordObservation(tx,localId,observation);if(receipt)await tx.complete(receipt);return result;});},
    async reconcile({orderId,attemptId,type='payment.create'}){
      const prepared=await store.transact(scope,orderId,async tx=>{
        const operation=required(tx).operations[operationKey(type,attemptId)];if(!operation)throw fail('operation_not_found');
        if(operation.state==='failed')throw fail('operation_failed');
        // Successful operations also need later asynchronous state observations.
        if(operation.state==='succeeded')return {completed:true,operation:structuredClone(operation),order:structuredClone(tx.order)};
        const ticket=claimOperation(operation,{now:now(),leaseMs,reconcile:true});return {orderId,operation:structuredClone(operation),ticket,order:structuredClone(tx.order)};
      });
      const operation=prepared.operation,record=type==='refund.create'?prepared.order.refunds[operation.local_id]:prepared.order.payments[operation.local_id];
      try{
        let remote;
        if(type==='payment.create'&&operation.intent.mode==='hosted'&&!operation.result?.provider_order_id){
          const link=await provider.findOwnedCheckout({reference_id:operation.correlation_id},providerConfig,env,context);
          if(!link)throw fail('outcome_unknown');equalIntent(operation.intent.order_intent.total,link.money);
          return await finish(orderId,operation,prepared.ticket,{local_id:operation.local_id,checkout_url:link.checkout_url,provider_reference:link.provider_reference,provider_order_id:link.provider_order_id});
        }
        if(type==='refund.create')remote=record.provider_id?await provider.retrieveRefund(record.provider_id,providerConfig,env,context):await provider.findRefund(operation.intent,providerConfig,env,context);
        else remote=record.provider_id?await provider.retrievePayment(record.provider_id,providerConfig,env,context):await provider.findPayment({reference_id:operation.correlation_id,order_id:operation.result?.provider_order_id,begin_time:prepared.order.created_at},providerConfig,env,context);
        if(!remote)throw fail('outcome_unknown');
        const observation=type==='refund.create'?provider.refundObservation(remote,scope):provider.paymentObservation(remote,scope);
        if((type==='payment.capture'&&observation.status!=='completed')||(type==='payment.cancel'&&observation.status!=='canceled'))throw fail('outcome_unknown');
        const result={local_id:operation.local_id,provider_id:observation.provider_id,status:observation.status};
        if(prepared.completed){await api.observe({orderId,localId:operation.local_id,observation});return result;}
        return await finish(orderId,operation,prepared.ticket,result,observation);
      }catch(error){if(!prepared.completed)await uncertain(orderId,operation,prepared.ticket,{code:'reconciliation_incomplete'});throw error;}
    }
  };
  return Object.freeze(api);
}
