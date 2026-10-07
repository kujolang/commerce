import {Pool} from 'pg';
import {createPostgresPaymentStore} from '../../adapters/postgres-payments.mjs';
import {createPaymentService} from '../../src/payments/index.mjs';
import {providerFor} from '../../src/providers.mjs';

// Single-owner Sandbox example. The OS account and protected local deployment
// file are the operator authentication boundary; --actor alone grants nothing.
export async function createDeployment(){
  for(const name of ['COMMERCE_POSTGRES_URL','COMMERCE_MERCHANT_ID','SQUARE_MERCHANT_ID','SQUARE_LOCATION_ID','SQUARE_ACCESS_TOKEN','COMMERCE_OPERATOR'])if(!process.env[name])throw new Error(`Required configuration: ${name}`);
  const pool=new Pool({connectionString:process.env.COMMERCE_POSTGRES_URL}),store=createPostgresPaymentStore({pool,schema:process.env.COMMERCE_SCHEMA||'commerce'});
  await store.migrate();
  const scope={merchant_id:process.env.COMMERCE_MERCHANT_ID,connection_id:'square-owner',provider:'square',environment:'sandbox',provider_merchant_id:process.env.SQUARE_MERCHANT_ID,location_id:process.env.SQUARE_LOCATION_ID};
  const service=createPaymentService({store,provider:providerFor('square'),scope,config:{location_id:scope.location_id,api_base:'https://connect.squareupsandbox.com'},env:process.env});
  return {schema:'kujo-commerce-deployment/v1',store,service,
    authorizeOperator:async({actor})=>actor===process.env.COMMERCE_OPERATOR,
    audit:async event=>{process.stderr.write(JSON.stringify({...event,scope,at:new Date().toISOString()})+'\n');},
    close:()=>pool.end()};
}
