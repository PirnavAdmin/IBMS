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
  const styles=['src/styles/index.css','src/styles/App.css','src/styles/Dashboard.css','src/styles/AppTheme.css','src/pages/Customers/styles/customer-list.css','src/components/ThemedDatePicker.css'].map(p=>fs.readFileSync(p,'utf8').replace(/@import[^;]+;/g,'')).join('\n');
  const html='<style>'+styles+'</style><div class="app-layout"><aside style="display:none"><div class="bd-sidebar-scroll"></div></aside><div class="app-layout-main"><div class="app-layout-content"><main class="customers-page"><section class="customer-panel"><div class="customer-panel-heading"><div><h2>Customer directory</h2><p>Customer profiles</p></div><span class="customer-result-count">41 customers</span></div><div style="height:1800px"></div></section></main></div></div></div><div class="quote-calendar"><div class="quote-calendar-grid">'+Array.from({length:7},(_,i)=>'<button>'+i+'</button>').join('')+'</div></div>';
  for (const width of [375,1366]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
    const tree=await call('Page.getFrameTree');
    await call('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});
    const result=await call('Runtime.evaluate',{expression:`JSON.stringify((()=>{const area=document.querySelector('.app-layout-content'),header=document.querySelector('.customer-panel-heading'),count=document.querySelector('.customer-result-count'),grid=document.querySelector('.quote-calendar-grid');const right=getComputedStyle(area),left=getComputedStyle(document.querySelector('.bd-sidebar-scroll'));return {rightColor:right.scrollbarColor,leftColor:left.scrollbarColor,rightWidth:right.scrollbarWidth,leftWidth:left.scrollbarWidth,scrolls:area.scrollHeight>area.clientHeight,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,countRight:count.getBoundingClientRect().right,headerRight:header.getBoundingClientRect().right,headerPadding:parseFloat(getComputedStyle(header).paddingRight),overflow:document.documentElement.scrollWidth>innerWidth};})())`,returnByValue:true});
    const metrics=JSON.parse(result.result.value);
    assert.equal(metrics.rightWidth,metrics.leftWidth);assert.equal(metrics.rightColor,'rgb(134, 102, 79) rgba(0, 0, 0, 0)');assert.equal(metrics.leftColor,'rgb(134, 102, 79) rgb(53, 35, 28)');
    assert.equal(metrics.scrolls,true);assert.equal(metrics.columns,7);assert.equal(metrics.overflow,false);
    assert.ok(metrics.countRight<=metrics.headerRight);
    if(width>600) assert.ok(Math.abs(metrics.headerRight-metrics.countRight-metrics.headerPadding)<2);
  }
  console.log('PASS Chromium: transparent right scrollbar track and original sidebar, themed calendar grid, and customer count placement at mobile and desktop widths.');
} finally { socket?.close(); chrome.kill(); }
