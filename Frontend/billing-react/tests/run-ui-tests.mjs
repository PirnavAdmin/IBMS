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
    jsx: 'automatic', loader: { '.css': 'empty' }, external: ['jsdom', 'react', 'react/*', 'react-dom', 'react-dom/*', 'antd', '@mui/*', '@emotion/*', '@tanstack/*', 'axios', 'dayjs'], mainFields: ['module', 'main'],
    alias: Object.fromEntries(['billing-contracts', 'billing-api-client'].map(name => [name, fileURLToPath(new URL(`../${name}/index.js`, root))])),
    define: { 'import.meta': '{"env":{}}', 'process.env.NODE_ENV': '"development"' },
    banner: { js: `const { JSDOM } = require('jsdom');
      const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000', pretendToBeVisual: true });
      for (const key of ['CustomEvent','window','localStorage','document','Document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','MouseEvent','Event','Node','Element','DocumentFragment','SVGElement','ShadowRoot']) global[key] = dom.window[key];
      Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
      global.getComputedStyle = element => dom.window.getComputedStyle(element);
      global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
      global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.scrollTo = () => {}; HTMLElement.prototype.scrollTo = () => {};
      global.IS_REACT_ACT_ENVIRONMENT = true;` },
  });
  const result = spawnSync(process.execPath, ['--test', '--test-force-exit', ...process.argv.slice(2), fileURLToPath(output)], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  try { unlinkSync(output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
