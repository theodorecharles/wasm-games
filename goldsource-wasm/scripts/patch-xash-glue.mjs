#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const [, , input, output] = process.argv;
if (!input || !output) throw new Error('Usage: patch-xash-glue.mjs INPUT OUTPUT');

let source = await readFile(input, 'utf8');
source = source.replace(
  'if(typeof exports==="object"&&typeof module==="object"){module.exports=Xash3D;module.exports.default=Xash3D}else if(typeof define==="function"&&define["amd"])define([],()=>Xash3D);',
  'export default Xash3D;'
);
// Expose the Emscripten environment table so hosts can set variables the
// engine or gamedll chain-loaders read via getenv (e.g. XASH3D_GAMELIBPATH).
source = source.replace('var ENV={};', 'var ENV={};Module["ENV"]=ENV;');
source = source.split('run();').join('');
source = source.split(';if(runtimeInitialized){moduleRtn=Module}else{moduleRtn=new Promise((resolve,reject)=>{readyPromiseResolve=resolve;readyPromiseReject=reject})}').join('');
source = source.replace('return moduleRtn', `
        return {
            Module,
            FS,
            SOCKFS,
            DNS,
            HEAPU32,
            HEAP32,
            HEAP16,
            HEAP8,
            HEAPU8,
            getValue,
            addFunction,
            removeFunction,
            setValue,
            writeArrayToMemory,
            intArrayFromString,
            writeSockaddr,
            readSockaddr,
            AsciiToString,
            _malloc,
            addRunDependency,
            removeRunDependency,
            start: () => {
                run();
                if (runtimeInitialized) {
                    moduleRtn = Module
                } else {
                    moduleRtn = new Promise((resolve, reject) => {
                        readyPromiseResolve = resolve;
                        readyPromiseReject = reject
                    })
                }
            },
        };
    `);

if (!source.includes('export default Xash3D;') || !source.includes('WasmGame_RuntimeState') || !source.includes('Module["ENV"]=ENV;')) {
  throw new Error('Patched Xash glue is missing its ESM export, framework native seam, or ENV exposure.');
}
await writeFile(output, source);

