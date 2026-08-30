import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('copyable Static Mode example contains no runtime code or unsafe checkout URL',()=>{const html=fs.readFileSync('examples/static-links/site/index.html','utf8');assert.doesNotMatch(html,/<script|_kujo\/commerce|localhost|javascript:/i);assert.match(html,/zero-runtime/i);assert.equal((html.match(/https:\/\/example\.com\/\?product=/g)||[]).length,2);});

test('Static Mode documentation names its capability boundary',()=>{const docs=fs.readFileSync('docs/static-mode.md','utf8');assert.match(docs,/GitHub Pages/);assert.match(docs,/no Node\nserver, serverless function, database, API credential/);assert.match(docs,/optional Hybrid Mode/);});
