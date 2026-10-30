// Test-only tool download. Cache is ignored and never published.
import {mkdir,readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';import{icarusBase,icarusFiles}from'../engine/runtime-manifest.js';
const cache=new URL('../.engine-cache/',import.meta.url);await mkdir(cache,{recursive:true});
for(const [name,expected]of Object.entries(icarusFiles)){
 const path=new URL(name,cache);let bytes;try{bytes=await readFile(path);}catch{}
 const hash=b=>createHash('sha256').update(b).digest('hex');
 if(bytes&&hash(bytes)===expected)continue;
 const response=await fetch(icarusBase+name);if(!response.ok)throw Error('Tool download failed: '+name);
 bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!==expected)throw Error('Integrity failure: '+name);await writeFile(path,bytes);
}
console.log('All six Icarus assets verified against pinned SHA-256.');
