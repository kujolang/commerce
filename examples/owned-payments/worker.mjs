import {createDeployment} from './deployment.mjs';
import {reconcileOwnedOrders,processPaymentWebhook} from '../../src/payments/index.mjs';
import {providerFor} from '../../src/providers.mjs';
const deployment=await createDeployment();
try{
  const {store,service}=deployment,config={location_id:service.scope.location_id,api_base:'https://connect.squareupsandbox.com'};
  for(let count=0;count<100;count++){
    const result=await processPaymentWebhook({store,service,provider:providerFor('square'),scope:service.scope,config,env:process.env});
    if(!result)break;
  }
  let cursor=null;
  for(let page=0;page<10;page++){
    const result=await reconcileOwnedOrders({store,service,cursor});cursor=result.next_cursor;
    process.stdout.write(JSON.stringify(result)+'\n');if(!cursor)break;
  }
}finally{await deployment.close();}
