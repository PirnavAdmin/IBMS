import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const output = new URL("tests/.invoice-tests.cjs", root);
try {
  await build({
    entryPoints: [
      fileURLToPath(new URL("tests/invoice-interactions.test.jsx", root)),
    ],
    outfile: fileURLToPath(output),
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    loader: { ".css": "empty" },
    external: ["jsdom"],
    alias: Object.fromEntries(
      ["billing-contracts", "billing-api-client"].map((name) => [
        name,
        fileURLToPath(new URL(`../${name}/index.js`, root)),
      ]),
    ),
    define: {
      "import.meta": '{"env":{}}',
      "process.env.NODE_ENV": '"development"',
    },
    banner: {
      js: `const {JSDOM}=require('jsdom');const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost:3000',pretendToBeVisual:true});for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','MouseEvent','Event','Node', 'Element','DocumentFragment'])global[key]=dom.window[key];Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});global.getComputedStyle=dom.window.getComputedStyle;global.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);global.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);global.HTMLElement.prototype.getBoundingClientRect=function(){return {x:0,y:0,width:100,height:40,top:0,right:100,bottom:40,left:0};};global.IS_REACT_ACT_ENVIRONMENT=true;`,
    },
  });
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-force-exit", ...process.argv.slice(2), fileURLToPath(output)],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} finally {
  try {
    unlinkSync(output);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
