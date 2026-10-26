import { readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const cwd = new URL('../', import.meta.url);
const runners = readdirSync(new URL('../tests/', import.meta.url)).filter(n => /^run-.*\.mjs$/.test(n));
const contracts = readdirSync(new URL('../tests/', import.meta.url)).filter(n => n.endsWith('.test.mjs')).map(n => `tests/${n}`);
const models = ['src/pages/Taxes/taxModel.test.mjs', ...readdirSync(new URL('../src/pages/Dashboard/', import.meta.url)).filter(n => n.endsWith('.test.mjs')).map(n => `src/pages/Dashboard/${n}`)];
const results = [];
for (const [name, args] of [['contracts-and-models', ['--test', ...contracts, ...models]], ...runners.map(n => [n, [`tests/${n}`]])]) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: name === 'run-ui-tests.mjs' ? 600000 : 180000, maxBuffer: 24 * 1024 * 1024 });
  writeFileSync(new URL(`./${name}.log`, import.meta.url), (result.stdout || '') + (result.stderr || '') + (result.error ? `\n${result.error}` : ''));
  const counts = Object.fromEntries([...String(result.stdout).matchAll(/(?:? |# )(tests|pass|fail|cancelled|skipped|todo) (\d+)/g)].map(([, key, value]) => [key, Number(value)]));
  results.push({name, status:result.status, signal:result.signal, error:result.error?.message, ...counts});
  writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(results,null,2));
  console.log(name, result.status, result.error?.message || '');
}

process.exitCode = results.some(result => result.status !== 0) ? 1 : 0;
