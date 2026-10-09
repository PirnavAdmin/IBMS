import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('tests/.audit-activity-tests.cjs', root);
try {
  await build({
    entryPoints: [fileURLToPath(new URL('tests/audit-activity.test.mjs', root))],
    outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'cjs',
    alias: { axios: fileURLToPath(new URL('node_modules/axios/index.js', root)) },
    define: { 'import.meta': '{"env":{}}' },
  });
  const result = spawnSync(process.execPath, ['--test', fileURLToPath(output)], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  try { unlinkSync(output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
