import {createPaymentService} from '../payments/service.mjs';
import {fail} from '../payments/model.mjs';
export async function createConnectedPaymentService({connections,binding,store,provider,config={},context={}}){
  const {connection}=await connections.credentials(binding);
  if(!connection.location_id)throw fail('connection_location_required');
  const scope={merchant_id:connection.merchant_id,connection_id:connection.connection_id,environment:connection.environment,provider:'square',provider_merchant_id:connection.provider_merchant_id,location_id:connection.location_id};
  const resolveToken=async()=>{
    const current=await connections.credentials(binding);
    if(current.connection.provider_merchant_id!==scope.provider_merchant_id||current.connection.location_id!==scope.location_id)throw fail('connection_changed');
    return current.access_token;
  };
  return createPaymentService({store,provider,scope,config:{...config,location_id:scope.location_id},context:{...context,resolveToken}});
}
