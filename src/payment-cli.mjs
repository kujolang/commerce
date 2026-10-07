import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertDeploymentManifest,reconcileOwnedOrders} from './payments/recovery.mjs';

export async function runPaymentCommand(argv){
  const command=argv[0]||'status',value=flag=>{const index=argv.indexOf(flag);return index<0?undefined:argv[index+1];};
  const deployment=value('--deployment'),actor=value('--actor');if(!deployment||!actor)throw new Error('payment commands require --deployment FILE and --actor ID');
  const module=await import(pathToFileURL(path.resolve(deployment)).href),manifest=assertDeploymentManifest(await module.createDeployment());
  try{
    if(!['status','reconcile','sweep','replay'].includes(command))throw new Error('unknown payment command');
    if(!await manifest.authorizeOperator({actor,action:`payment.${command}`,scope:manifest.service.scope}))throw new Error('operator authorization denied');
    const orderId=value('--order');let result;
    await manifest.audit({actor,action:`payment.${command}`,phase:'requested',order_id:orderId||null});
    if(command==='status'){
      if(!orderId)throw new Error('--order is required');const order=await manifest.service.get(orderId);if(!order)throw new Error('order not found');
      result={id:order.id,state:order.state,version:order.version,payments:Object.values(order.payments).map(payment=>({id:payment.id,status:payment.status,money:payment.money})),operations:Object.values(order.operations).map(operation=>({id:operation.id,type:operation.type,state:operation.state}))};
    }else if(command==='reconcile'){
      if(!orderId||!value('--operation'))throw new Error('--order and --operation are required');result=await manifest.service.reconcile({orderId,attemptId:value('--operation'),type:value('--type')||'payment.create'});
    }else if(command==='sweep')result=await reconcileOwnedOrders({store:manifest.store,service:manifest.service,cursor:value('--cursor')?JSON.parse(value('--cursor')):null,onOtherOperation:manifest.reconcileOther});
    else{if(!value('--event'))throw new Error('--event is required');result=await manifest.store.replay(manifest.service.scope,value('--event'),actor);}
    await manifest.audit({actor,action:`payment.${command}`,phase:'completed',order_id:orderId||null});return result;
  }finally{await manifest.close?.();}
}
