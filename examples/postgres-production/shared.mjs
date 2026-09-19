import pg from 'pg';
import {createPostgresCommerce} from '@kujolang/commerce/adapters/postgres';

export const required=name=>{const value=process.env[name];if(!value)throw new Error(`${name} is required`);return value;};
const database=process.env.COMMERCE_DATABASE_URL?{connectionString:process.env.COMMERCE_DATABASE_URL}:{host:required('PGHOST'),port:Number(process.env.PGPORT||5432),user:required('PGUSER'),password:required('PGPASSWORD'),database:required('PGDATABASE')};
export const pool=new pg.Pool({...database,max:Number(process.env.COMMERCE_DATABASE_POOL_SIZE||10),connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
export const stores=createPostgresCommerce({pool,schema:process.env.COMMERCE_DATABASE_SCHEMA||'commerce',leaseMs:Number(process.env.COMMERCE_LEASE_MS||30000),rawEventArchive:process.env.COMMERCE_ARCHIVE_RAW_EVENTS==='true'});
export const json=(response,status=200)=>new Response(JSON.stringify(response),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export const authorized=request=>{const token=required('COMMERCE_OPERATOR_TOKEN'),provided=(request.headers.get('authorization')||'').replace(/^Bearer /,'');if(provided.length!==token.length)return false;let result=0;for(let index=0;index<token.length;index+=1)result|=token.charCodeAt(index)^provided.charCodeAt(index);return result===0;};
export const publicReceipt=({raw_body,...receipt})=>receipt;
export const close=()=>pool.end();
