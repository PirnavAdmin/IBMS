import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outfile = new URL('./.payment-ui-qa.cjs', import.meta.url);
try {
  await build({
    entryPoints: [fileURLToPath(new URL('./payments-ui.test.jsx', import.meta.url))],
    outfile: fileURLToPath(outfile), bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
    loader: { '.css': 'empty' },
    alias: Object.fromEntries(['billing-contracts', 'billing-api-client'].map(name => [name, fileURLToPath(new URL(`../../${name}/index.js`, import.meta.url))])),
    define: { 'import.meta': '{"env":{}}', 'process.env.NODE_ENV': '"production"' },
  });
  const result = spawnSync(process.execPath, ['--test', fileURLToPath(outfile)], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await unlink(outfile).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
