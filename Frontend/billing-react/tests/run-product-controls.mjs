import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const outfile = new URL('./.product-controls.cjs', import.meta.url);
try {
  await build({
    entryPoints: [fileURLToPath(new URL('./product-controls.test.jsx', import.meta.url))],
    outfile: fileURLToPath(outfile), bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
    loader: { '.css': 'empty' }, external: ['jsdom'],
    alias: Object.fromEntries(['billing-contracts', 'billing-api-client'].map(name => [name, fileURLToPath(new URL(`../../${name}/index.js`, import.meta.url))])),
    define: { 'import.meta': '{"env":{}}', 'process.env.NODE_ENV': '"development"' },
    banner: { js: `const { JSDOM } = require('jsdom');
      const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000', pretendToBeVisual: true });
      for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','MouseEvent','Event','Node','Element','DocumentFragment','SVGElement','ShadowRoot']) global[key] = dom.window[key];
      Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
      global.getComputedStyle = dom.window.getComputedStyle;
      global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
      global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      global.IS_REACT_ACT_ENVIRONMENT = true;` },
  });
  const result = spawnSync(process.execPath, ['--test', '--test-force-exit', fileURLToPath(outfile)], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exitCode = result.status ?? 1;
} finally { await unlink(outfile).catch(() => {}); }
