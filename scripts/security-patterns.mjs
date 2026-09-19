import fs from 'node:fs/promises';
import path from 'node:path';

const browser=await fs.readFile(new URL('../browser/commerce.js',import.meta.url),'utf8');
const runtime=await fs.readFile(new URL('../runtime/index.mjs',import.meta.url),'utf8');
const failures=[];
if(/\.innerHTML\s*=|insertAdjacentHTML\s*\(/.test(browser))failures.push('browser/commerce.js contains an unsafe HTML injection sink');
if(/console\.(log|error)\([^)]*(secret|token|providerFailure)/i.test(runtime))failures.push('runtime may log sensitive provider details');
if(/public-demo-disabled|whsec_test|sk_live_/.test(runtime))failures.push('runtime contains a credential placeholder or live key');
for(const root of ['src','runtime','browser','bin','examples'])for(const entry of await fs.readdir(root,{recursive:true,withFileTypes:true})){if(!entry.isFile())continue;const file=path.join(entry.parentPath||entry.path,entry.name),content=await fs.readFile(file,'utf8');if(/(?:sk_live_|sq0atp-|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(content))failures.push(`${file} contains material resembling a production secret`);}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Security pattern checks passed');
