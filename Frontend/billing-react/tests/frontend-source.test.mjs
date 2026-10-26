import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { transform } from 'esbuild';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const files = directory => readdirSync(directory, {withFileTypes:true}).flatMap(entry => entry.isDirectory()
  ? files(resolve(directory, entry.name)) : /\.(js|jsx|mjs)$/.test(entry.name) ? [resolve(directory, entry.name)] : []);
test('Every frontend source module parses and every literal relative import resolves', async () => {
  const sources = files(root);
  for (const file of sources) {
    const {code} = await transform(readFileSync(file, 'utf8'), {loader:extname(file) === '.jsx' ? 'jsx' : 'js', format:'esm', sourcefile:file});
    const imports = [...code.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']/g)];
    for (const [,specifier] of imports) {
      const path = resolve(dirname(file), specifier.split(/[?#]/)[0]);
      assert.ok([path, ...['.js','.jsx','.mjs','.json','.css','/index.js','/index.jsx'].map(extension => path + extension)]
        .some(candidate => existsSync(candidate) && statSync(candidate).isFile()), `${file}: unresolved ${specifier}`);
    }
  }
  assert.ok(sources.length > 100);
  console.log(`Parsed ${sources.length} frontend modules and checked literal relative imports.`);
});

test('Tracked source plus the four required runtime additions resolves clean-checkout relative imports', async () => {
  const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim();
  const required = [
    'Frontend/billing-react/src/components/DateRangeDatePicker.jsx',
    'Frontend/billing-react/src/pages/Dashboard/dashboardAging.js',
    'Frontend/billing-react/src/pages/Invoices/services/invoiceExport.js',
    'Frontend/billing-react/src/pages/NumberingSettings/validation/numberingTokens.js',
  ];
  const tracked = execFileSync('git', ['ls-files', '-z', '--cached'], { cwd: repository, encoding: 'utf8' }).split('\0').filter(Boolean);
  const checkout = new Set([...tracked, ...required].map(path => resolve(repository, path)));
  for (const file of files(root)) {
    assert.ok(checkout.has(file), `Runtime source missing from checkout manifest: ${file}`);
    const { code } = await transform(readFileSync(file, 'utf8'), { loader: extname(file) === '.jsx' ? 'jsx' : 'js', format: 'esm', sourcefile: file });
    for (const [, specifier] of code.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']/g)) {
      const path = resolve(dirname(file), specifier.split(/[?#]/)[0]);
      assert.ok([path, ...['.js', '.jsx', '.mjs', '.json', '.css', '/index.js', '/index.jsx'].map(extension => path + extension)]
        .some(candidate => checkout.has(resolve(candidate)) && existsSync(candidate)), `Missing clean-checkout dependency: ${file}: ${specifier}`);
    }
  }
  for (const path of required) assert.ok(existsSync(resolve(repository, path)), path);
});
