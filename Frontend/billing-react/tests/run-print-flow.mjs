import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const output=fileURLToPath(new URL('./.print-flow.cjs',import.meta.url));
try {
  await build({entryPoints:['tests/print-flow.test.jsx'],outfile:output,bundle:true,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},alias:Object.fromEntries(['billing-contracts','billing-api-client'].map(name=>[name,fileURLToPath(new URL(`../../${name}/index.js`,import.meta.url))])),define:{'import.meta':'{"env":{}}','process.env.NODE_ENV':'"production"'}});
  const result=spawnSync(process.execPath,['--test',output],{stdio:'inherit'});process.exitCode=result.status??1;
} finally {try{unlinkSync(output);}catch(error){if(error.code!=='ENOENT')throw error;}}
