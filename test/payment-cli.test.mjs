import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runPaymentCommand} from '../src/payment-cli.mjs';
test('operator CLI requires authorization, audits access, closes deployment and projects safe status',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'commerce-cli-')),file=path.join(dir,'deployment.mjs');
  globalThis.commerceCliAudit=[];globalThis.commerceCliClosed=0;
  await writeFile(file,`export async function createDeployment(){return {schema:'kujo-commerce-deployment/v1',store:{},service:{scope:{merchant_id:'merchant'},get:async()=>({id:'order',state:'open',version:1,payments:{},operations:{op:{id:'op',type:'payment.create',state:'unknown',secret:'must-not-output'}}})},authorizeOperator:async({actor})=>actor==='operator',audit:async event=>globalThis.commerceCliAudit.push(event),close:()=>globalThis.commerceCliClosed++};}`);
  try{
    await assert.rejects(()=>runPaymentCommand(['status','--deployment',file,'--actor','attacker','--order','order']),/denied/);
    assert.equal(globalThis.commerceCliAudit.length,0);
    const result=await runPaymentCommand(['status','--deployment',file,'--actor','operator','--order','order']);assert.ok(!JSON.stringify(result).includes('secret'));assert.equal(globalThis.commerceCliClosed,2);assert.deepEqual(globalThis.commerceCliAudit.map(value=>value.phase),['requested','completed']);
  }finally{delete globalThis.commerceCliAudit;delete globalThis.commerceCliClosed;await rm(dir,{recursive:true});}
});
