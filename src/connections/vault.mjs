const encode=bytes=>btoa(String.fromCharCode(...bytes));
const decode=value=>Uint8Array.from(atob(value),character=>character.charCodeAt(0));
export function createTokenVault({keys,activeKeyId}){
  if(!Object.hasOwn(keys||{},activeKeyId))throw new Error('Active encryption key required');
  const key=async id=>{const bytes=keys[id];if(!(bytes instanceof Uint8Array)||bytes.length!==32)throw new Error('AES-256 key required');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);};
  return Object.freeze({
    async seal(value,scope){const iv=crypto.getRandomValues(new Uint8Array(12)),data=new TextEncoder().encode(JSON.stringify(value));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(scope)},await key(activeKeyId),data);return {key_id:activeKeyId,iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext))};},
    async open(envelope,scope){if(!Object.hasOwn(keys,envelope.key_id))throw new Error('Unknown encryption key');const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.iv),additionalData:new TextEncoder().encode(scope)},await key(envelope.key_id),decode(envelope.ciphertext));return JSON.parse(new TextDecoder().decode(data));}
  });
}
export async function hashState(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
