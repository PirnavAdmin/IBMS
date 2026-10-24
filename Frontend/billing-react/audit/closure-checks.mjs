// Explicit affected checks only. Never discovers or starts a project-wide suite.
import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
const jobs = {
  'reproduce-invoice': ['tests/run-invoice-ui.mjs', '--test-timeout=20000', '--test-name-pattern=Edit preserves|Blank draft|Details tabs'],
  payments: ['tests/run-payment-ui.mjs'],
  'payments-final': ['tests/run-payment-ui.mjs'],
  'payment-precision-reproduction': ['tests/run-payment-ui.mjs', '--test-name-pattern=Validation covers'],
  'payment-validation': ['tests/run-payment-ui.mjs', '--test-name-pattern=Validation covers'],
  'reproduce-unit-price': ['tests/run-ui-tests.mjs', '--test-timeout=20000', '--test-name-pattern=PQA Unit Price'],
  invoice: ['tests/run-invoice-ui.mjs', '--test-timeout=20000', '--test-name-pattern=Dashboard hides|Invoice API|Draft DTO|Form validates|Concurrency|Preview renders|Edit loads|Details tabs|Numbering|Invoice CSV|Blank draft|Invoice Send|Payment retry|Record payment'],
  'focused-ui': ['tests/run-ui-tests.mjs', '--test-timeout=20000', '--test-name-pattern=PQA Unit Price|unsupported billing currency|country.*(save|server|backend)|Country.*(save|server|backend)'],
  contracts: ['--test', '--test-timeout=20000', 'tests/numbering-contract.test.mjs', 'tests/invoice-export.test.mjs', 'tests/css-cascade.test.mjs', 'tests/frontend-source.test.mjs', 'src/pages/Dashboard/dashboardModel.test.mjs', 'src/pages/Dashboard/dashboardRadial.test.mjs'],
  'invoice-followup': ['tests/run-invoice-ui.mjs', '--test-timeout=20000', '--test-name-pattern=Edit loads|Payment retry'],
  source: ['--test', '--test-timeout=20000', 'tests/frontend-source.test.mjs'],
  build: ['node_modules/vite/bin/vite.js', 'build'],
  'build-retry': ['node_modules/vite/bin/vite.js', 'build'],
  'build-final': ['node_modules/vite/bin/vite.js', 'build'],
};
const name = process.argv[2];
if (!Object.hasOwn(jobs, name)) throw new Error('Choose one explicit closure check.');
const file = new URL(`closure-${name}.log`, import.meta.url);
const out = openSync(file, 'w');
const started = Date.now();
const child = spawn(process.execPath, jobs[name], {
  cwd: new URL('../', import.meta.url), stdio: ['ignore', out, out],
  env: { ...process.env, NODE_OPTIONS: ['build-retry', 'build-final'].includes(name) ? '--max-old-space-size=4096' : '--max-old-space-size=2048' }, windowsHide: true,
});
let blocked = false;
const timer = setTimeout(() => {
  blocked = true;
  // This PID belongs to the runner created immediately above, not a dev server.
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill('SIGTERM');
}, ['build-retry', 'build-final'].includes(name) ? 180000 : ['build', 'invoice'].includes(name) ? 120000 : 90000);
child.on('error', error => { clearTimeout(timer); closeSync(out); throw error; });
child.on('close', (status, signal) => {
  clearTimeout(timer); closeSync(out);
  const log = readFileSync(file, 'utf8');
  const counts = Object.fromEntries([...log.matchAll(/(?:^|\n)[^\n]*?\b(tests|pass|fail|cancelled|skipped|todo) (\d+)\r?(?=\n|$)/g)].map(([, key, value]) => [key, Number(value)]));
  const result = { name, args: jobs[name], status, signal, blocked, durationMs: Date.now() - started, checkedAt: new Date().toISOString(), ...counts };
  writeFileSync(new URL(`closure-${name}.json`, import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  console.log(log.split(/\r?\n/).filter(line => /^.*(?:failing tests:|AssertionError|Expected element|Expected input|test at |\bnot ok\b)/.test(line)).map(line => line.slice(0, 350)).join('\n'));
  process.exitCode = blocked ? 2 : status ?? 1;
});
