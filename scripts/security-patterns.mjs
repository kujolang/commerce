import fs from 'node:fs/promises';

const browser=await fs.readFile(new URL('../browser/commerce.js',import.meta.url),'utf8');
const runtime=await fs.readFile(new URL('../runtime/index.mjs',import.meta.url),'utf8');
const failures=[];
if(/\.innerHTML\s*=|insertAdjacentHTML\s*\(/.test(browser))failures.push('browser/commerce.js contains an unsafe HTML injection sink');
if(/console\.(log|error)\([^)]*(secret|token|providerFailure)/i.test(runtime))failures.push('runtime may log sensitive provider details');
if(/public-demo-disabled|whsec_test|sk_live_/.test(runtime))failures.push('runtime contains a credential placeholder or live key');
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Security pattern checks passed');
