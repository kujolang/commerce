import test from 'node:test';
import assert from 'node:assert/strict';
import {providers} from '../src/providers.mjs';
import {assertProviderConformance,providerConformance} from '../src/conformance.mjs';

for(const provider of Object.values(providers))test(`provider contract: ${provider.id}`,()=>assert.equal(assertProviderConformance(provider),true));
test('conformance suite rejects incomplete adapters',()=>{assert.deepEqual(providerConformance({id:'bad',version:'1.0.0',capabilities:{}}).some(issue=>issue.includes('missing createCheckout')),true);});
