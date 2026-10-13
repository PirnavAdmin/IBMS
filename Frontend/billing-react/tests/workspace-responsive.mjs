import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

// Isolated CSS stress fixtures, not production records or API replacements.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ibms-responsive-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir='+profile, 'about:blank'], { windowsHide:true, stdio:'ignore' });
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
let socket;
try {
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<150 && !fs.existsSync(portFile);i++) await pause(100);
  assert.ok(fs.existsSync(portFile),'Headless Chrome started');
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
  socket=new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  let id=0;const pending=new Map();
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(pending.has(data.id)){const {resolve,reject}=pending.get(data.id);pending.delete(data.id);data.error?reject(data.error):resolve(data.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const styles=['src/styles/Dashboard.css','src/styles/ModuleSpacing.css','src/styles/AppTheme.css','src/pages/Customers/styles/customer-details.css','src/pages/Customers/styles/customer-list.css','src/styles/Payments.css','src/pages/Invoices/styles/invoices.css','src/styles/WorkspaceResponsive.css'].map(p=>fs.readFileSync(p,'utf8').replace(/@import[^;]+;/g,'')).join('\n');
  const long='LongUnbrokenContent'.repeat(12);
  const labels=['Code','Name','Type','Tax ID','Contact','Outstanding','Status','Actions'];
  const cells=labels.map((label,i)=>'<td class="MuiTableCell-root MuiTableCell-body" data-label="'+label+'"><div class="'+(['customer-code','customer-identity','customer-type','customer-tax','customer-contact','customer-balance','customer-status','customer-row-actions'][i])+'">'+(i===6?'Active':i===7?'<button>View</button><button>Edit</button>':long)+'</div></td>').join('');
  const shell=body=>'<style>html,body{margin:0;width:100%;font-family:Arial}'+styles+'</style><div class="app-layout"><aside class="bd-sidebar"></aside><div class="app-layout-main"><div class="app-layout-content">'+body+'</div></div></div>';
  const fixtures={customers:'<main class="customers-page"><section class="customer-panel"><div class="customer-table"><table class="MuiTable-root"><tbody><tr class="MuiTableRow-root">'+cells+'</tr></tbody></table></div></section></main>',details:'<main class="customer-page customer-details-view"><div class="customer-card-grid">'+[1,2].map(()=>'<section class="customer-card"><dl class="customer-fields">'+[1,2,3,4].map(()=>'<div><dt>Contact</dt><dd>'+long+'</dd></div>').join('')+'</dl></section>').join('')+'</div></main>',payments:'<main class="payments-page"><section class="payment-panel"><div class="payment-summary-content"><div>Payment summary</div><dl class="payment-values"><div>'+long+'</div><div>'+long+'</div></dl></div></section></main>',invoices:'<main class="invoice-page"><section class="invoice-panel"><div class="invoice-overview-layout"><dl class="invoice-values"><div>'+long+'</div></dl><dl class="invoice-values"><div>'+long+'</div></dl></div></section></main>'};
  fixtures.inactive=fixtures.customers.replace('class="customer-table"','class="customer-table is-inactive-view"');
  const widths=[...new Set([320,375,600,768,960,1024,1100,1179,1180,1280,1366,1536,1920,2400,...[1280,1536,1920].flatMap(base=>[.8,.9,1,1.1,1.25,1.5].map(zoom=>Math.round(base/zoom)))])];
  let checks=0;
  for(const dpr of [1,1.25,1.5]) for(const width of widths) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:dpr,mobile:false});
    for(const [name,content] of Object.entries(fixtures)) {
      const tree=await call('Page.getFrameTree');
      await call('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:shell(content)});
      const result=await call('Runtime.evaluate',{expression:"JSON.stringify({dpr:devicePixelRatio,overflow:[...document.querySelectorAll('.app-layout-main,.app-layout-content,main,.customer-panel,.customer-card,.payment-panel,.invoice-panel,td')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({class:e.className,label:e.getAttribute('data-label'),width:e.clientWidth,scroll:e.scrollWidth})),body:document.documentElement.scrollWidth})",returnByValue:true});
      const metrics=JSON.parse(result.result.value);
      assert.equal(metrics.dpr,dpr);
      assert.deepEqual(metrics.overflow,[],name+' width='+width+' DPR='+dpr+': '+JSON.stringify(metrics));
      assert.ok(metrics.body<=width+1);
      if(name==='customers' || name==='inactive') {
        const alignment=await call('Runtime.evaluate',{expression:"JSON.stringify({panel:document.querySelector('.customer-panel').clientWidth,tax:document.querySelector('[data-label=\"Tax ID\"]').getBoundingClientRect().top,contact:document.querySelector('[data-label=\"Contact\"]').getBoundingClientRect().top})",returnByValue:true});
        const a=JSON.parse(alignment.result.value);if(a.panel>448 && a.panel<=1100)assert.ok(Math.abs(a.tax-a.contact)<1,'Tax ID and Contact share one row');
      }
      checks++;
    }
  }
  console.log('PASS '+checks+' Chromium layout checks: widths 320-2400; DPR 1/1.25/1.5. Layout fixtures only; not live API or physical laptop QA.');
} finally { socket?.close(); chrome.kill(); }
