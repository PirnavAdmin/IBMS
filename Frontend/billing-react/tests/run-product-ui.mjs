import { uiModuleAliases } from './ui-build-config.mjs';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const outfile = new URL('./.product-ui-qa.cjs', import.meta.url);
try {
  await build({ mainFields: ['module', 'main'], entryPoints: [fileURLToPath(new URL('./product-ui.test.jsx', import.meta.url))], outfile: fileURLToPath(outfile), bundle: true, alias: { ...uiModuleAliases, ...({ 'billing-contracts': fileURLToPath(new URL('../../billing-contracts/index.js', import.meta.url)), 'billing-api-client': fileURLToPath(new URL('../../billing-api-client/index.js', import.meta.url)) }) }, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta': '{ "env": {} }' } });
  const result = spawnSync(process.execPath, ['--test', fileURLToPath(outfile)], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
} finally { await unlink(outfile).catch(() => {}); }
