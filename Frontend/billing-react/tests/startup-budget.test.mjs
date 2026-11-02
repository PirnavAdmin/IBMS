import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const htmlFile = resolve(dist, 'index.html');

test('Initial production JavaScript stays below 700 kB and excludes the PDF renderer', {
  skip: !existsSync(htmlFile) && 'Run npm run build first',
}, () => {
  const html = readFileSync(htmlFile, 'utf8');
  const entry = html.match(/<script[^>]+src="([^"]+)"/)[1];
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const ast = parse(readFileSync(file, 'utf8'), { sourceType: 'module' });
    for (const node of ast.program.body) {
      if (!['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) continue;
      const dependency = node.source?.value;
      if (dependency?.startsWith('.') && dependency.endsWith('.js')) visit(resolve(dirname(file), dependency));
    }
  }
  visit(resolve(dist, entry.replace(/^\//, '')));
  const bytes = [...visited].reduce((total, file) => total + statSync(file).size, 0);
  assert.ok(bytes <= 700_000, `Initial JavaScript is ${bytes} bytes; defer unrelated pages or dependencies`);
  assert.ok([...visited].every(file => !/html2pdf|html2canvas|jspdf/i.test(file)), 'PDF generation must load only when requested');
  console.log(`Initial static JavaScript: ${bytes} bytes across ${visited.size} chunk(s).`);
});
