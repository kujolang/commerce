import {squareJson,query} from '../providers/square/client.mjs';
import {scopeOf,scopedProviderConfig,fail,money} from '../payments/model.mjs';
import {assertStableId} from '../contracts.mjs';
import {executeProviderOperation} from '../idempotency.mjs';
import {canonicalJson} from '../revisions.mjs';

// Optional one-way integrations. No background sync, device interaction or
// fee policy is enabled merely by importing this module.
export function createSquareIntegrations({scope:inputScope,config={},env={},context={},operationStore,enabled={},authorizeResource}={}){
  const scope=scopeOf(inputScope);config=scopedProviderConfig(scope,config);
  const requireFeature=feature=>{if(enabled[feature]!==true)throw fail('integration_disabled');};
  const execute=async(type,id,intent,mutate)=>{const spec={operation_id:`integration:${JSON.stringify([scope,type,assertStableId(id)])}`,type,intent:{scope,...intent}};return executeProviderOperation(spec,{store:operationStore,mutate:async key=>mutate(key,await operationStore.get(spec.operation_id))});};
  return Object.freeze({
    async exportCatalog({operationId,objects,expectedVersions={}}){
      requireFeature('catalog');if(!Array.isArray(objects)||!objects.length||objects.length>100)throw fail('bounded_catalog_batch_required');
      for(const object of objects){if(!object.id||!['ITEM','ITEM_VARIATION','MODIFIER','MODIFIER_LIST','CATEGORY'].includes(object.type)||object.is_deleted)throw fail('unsupported_catalog_object');if(!object.id.startsWith('#')&&(!Number.isSafeInteger(expectedVersions[object.id])||object.version!==expectedVersions[object.id]))throw fail('catalog_version_required');}
      const snapshot=structuredClone(objects);
      return execute('catalog.export',operationId,{objects:snapshot,expected_versions:expectedVersions},async(key,operation)=>{
        for(const object of snapshot){if(object.id.startsWith('#')||operation.attempts>1)continue;const remote=(await squareJson(`/v2/catalog/object/${encodeURIComponent(object.id)}`,undefined,config,env,context,'GET')).object;if(remote.version!==expectedVersions[object.id])throw fail('catalog_drift');}
        const result=await squareJson('/v2/catalog/batch-upsert',{idempotency_key:key,batches:[{objects:snapshot}]},config,env,context);
        if(result.errors?.length)throw fail('catalog_batch_rejected');
        return {objects:(result.objects||[]).map(object=>({id:object.id,type:object.type,version:object.version})),id_mappings:result.id_mappings||[]};
      });
    },
    async importCatalog({cursor}={}){requireFeature('catalog');return squareJson(`/v2/catalog/list${query({cursor,types:'ITEM,ITEM_VARIATION'})}`,undefined,config,env,context,'GET');},
    async countInventory({operationId,catalogObjectId,quantity,occurredAt}){
      requireFeature('inventory');if(!/^\d+(?:\.\d{1,5})?$/.test(String(quantity))||!Number.isFinite(Date.parse(occurredAt)))throw fail('invalid_inventory_count');
      const count={catalog_object_id:assertStableId(catalogObjectId),location_id:scope.location_id,state:'IN_STOCK',quantity:String(quantity),occurred_at:occurredAt};
      return execute('inventory.count',operationId,{count},async key=>{const result=await squareJson('/v2/inventory/changes/batch-create',{idempotency_key:key,changes:[{type:'PHYSICAL_COUNT',physical_count:count}],ignore_unchanged_counts:true},config,env,context);if(result.errors?.length)throw fail('inventory_batch_rejected');return {counts:result.counts||[]};});
    },
    async inventory({catalogObjectIds,cursor}){requireFeature('inventory');if(!Array.isArray(catalogObjectIds)||catalogObjectIds.length>100)throw fail('bounded_inventory_query_required');return squareJson('/v2/inventory/counts/batch-retrieve',{catalog_object_ids:catalogObjectIds,location_ids:[scope.location_id],cursor},config,env,context);},
    async pairDevice({operationId,name,actor}){
      requireFeature('terminal');if(!actor||!await authorizeResource?.({scope,actor,action:'device.pair'}))throw fail('device_authorization_required');
      const paired=await execute('device.pair',operationId,{name:String(name).slice(0,128),location_id:scope.location_id},async key=>{const value=(await squareJson('/v2/devices/codes',{idempotency_key:key,device_code:{name:String(name).slice(0,128),product_type:'TERMINAL_API',location_id:scope.location_id}},config,env,context)).device_code;return {id:value.id,status:value.status,pair_by:value.pair_by,location_id:value.location_id};});
      const current=(await squareJson(`/v2/devices/codes/${encodeURIComponent(paired.id)}`,undefined,config,env,context,'GET')).device_code;return {...paired,code:current.code};
    },
    async device(id,{actor}={}){requireFeature('terminal');if(!actor||!await authorizeResource?.({scope,actor,action:'device.read',device_code_id:id}))throw fail('device_authorization_required');return (await squareJson(`/v2/devices/codes/${encodeURIComponent(id)}`,undefined,config,env,context,'GET')).device_code;},
    async disputes({cursor}={}){requireFeature('reporting');return squareJson(`/v2/disputes${query({cursor,location_id:scope.location_id})}`,undefined,config,env,context,'GET');},
    async payouts({cursor,begin_time,end_time}={}){requireFeature('reporting');return squareJson(`/v2/payouts${query({cursor,location_id:scope.location_id,begin_time,end_time})}`,undefined,config,env,context,'GET');},
    async payoutEntries(id,{cursor}={}){requireFeature('reporting');return squareJson(`/v2/payouts/${encodeURIComponent(id)}/payout-entries${query({cursor})}`,undefined,config,env,context,'GET');}
  });
}

export function applyInventoryCount(current,incoming){
  const next={catalog_object_id:assertStableId(incoming.catalog_object_id),location_id:assertStableId(incoming.location_id),state:String(incoming.state),quantity:String(incoming.quantity),calculated_at:incoming.calculated_at};
  if(!/^\d+(?:\.\d{1,5})?$/.test(next.quantity)||!Number.isFinite(Date.parse(next.calculated_at)))throw fail('invalid_inventory_count');
  if(!current)return next;
  if(current.catalog_object_id!==next.catalog_object_id||current.location_id!==next.location_id||current.state!==next.state)throw fail('inventory_scope_mismatch');
  const previousTime=Date.parse(current.calculated_at),time=Date.parse(next.calculated_at);
  if(time<previousTime)return current;if(time===previousTime&&canonicalJson(current)!==canonicalJson(next))throw fail('inventory_conflict');return next;
}
