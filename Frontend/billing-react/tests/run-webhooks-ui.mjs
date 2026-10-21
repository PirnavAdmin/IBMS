import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outfile = new URL('./.webhooks-tests.cjs', import.meta.url);
try {
  await build({
    entryPoints: [fileURLToPath(new URL('./webhooks.test.jsx', import.meta.url))],
    outfile: fileURLToPath(outfile), bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
    loader: { '.css': 'empty' }, external: ['jsdom'],
    alias: {
      axios: fileURLToPath(new URL('../node_modules/axios/index.js', import.meta.url)),
      ...Object.fromEntries(['billing-contracts', 'billing-api-client'].map(name => [name, fileURLToPath(new URL(`../../${name}/index.js`, import.meta.url))])),
    },
    define: { 'import.meta': '{"env":{}}', 'process.env.NODE_ENV': '"development"' },
    banner: { js: `const {JSDOM}=require('jsdom');
      const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost:3000/integrations',pretendToBeVisual:true});
      for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','MouseEvent','Event','Node','Element','DocumentFragment'])global[key]=dom.window[key];
      Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
      global.localStorage=dom.window.localStorage;global.sessionStorage=dom.window.sessionStorage;
      global.getComputedStyle=dom.window.getComputedStyle;global.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);global.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
      global.HTMLElement.prototype.getBoundingClientRect=function(){return{x:0,y:0,width:100,height:40,top:0,right:100,bottom:40,left:0}};
      global.IS_REACT_ACT_ENVIRONMENT=true;` },
  });
  const result = spawnSync(process.execPath, ['--test', '--test-force-exit', ...process.argv.slice(2), fileURLToPath(outfile)], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await unlink(outfile).catch(() => {}); }
