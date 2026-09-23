import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('tests/.ui-tests.cjs', root);
try {
  await build({
    stdin: {
      contents: readdirSync(new URL('tests/', root)).filter(name => name.endsWith('-ui.test.jsx')).map(name => `import ${JSON.stringify(`./tests/${name}`)};`).join('\n'),
      resolveDir: fileURLToPath(root), loader: 'jsx',
    },
    outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', loader: { '.css': 'empty' },
    alias: Object.fromEntries(['billing-contracts', 'billing-api-client'].map(name => [name, fileURLToPath(new URL(`../${name}/index.js`, root))])),
    define: { 'import.meta': '{"env":{}}', 'process.env.NODE_ENV': '"production"' },
  });
  const result = spawnSync(process.execPath, ['--test', fileURLToPath(output)], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  try { unlinkSync(output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
