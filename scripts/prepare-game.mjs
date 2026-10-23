import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
await mkdir('public',{recursive:true});
for(const f of await readdir('game')) if(f!=='index.html') await copyFile('game/'+f,'public/'+f);
const html=await readFile('game/index.html','utf8');
await writeFile('app/route.ts',`export function GET(){return new Response(${JSON.stringify(html)},{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}});}`);
