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
  const styles=['src/styles/Dashboard.css','src/styles/ModuleSpacing.css','src/styles/AppTheme.css','src/pages/Customers/styles/customer-details.css','src/pages/Customers/styles/customer-list.css','src/pages/Customers/styles/customer-base.css','src/components/CountryCallingCodeSelector.css','src/pages/Customers/styles/customer-form.css','src/styles/Payments.css','src/pages/Products/styles/products.css','src/pages/Invoices/styles/invoices.css','src/styles/WorkspaceResponsive.css','src/styles/WorkspaceUI.css'].map(p=>fs.readFileSync(p,'utf8').replace(/@import[^;]+;/g,'')).join('\n');
  const long='LongUnbrokenContent'.repeat(12);
  const labels=['Code','Name','Type','Tax ID','Contact','Outstanding','Status','Actions'];
  const cells=labels.map((label,i)=>'<td class="MuiTableCell-root MuiTableCell-body" data-label="'+label+'"><div class="'+(['customer-code','customer-identity','customer-type','customer-tax','customer-contact','customer-balance','customer-status','customer-row-actions'][i])+'">'+(i===4?'<a class="customer-email-link" href="mailto:long.customer.billing.address.with.multiple.parts@company.example.com">long.customer.billing.address.with.multiple.parts@company.example.com</a><small>+91 9876543210</small>':i===1?'<div class="MuiAvatar-root customer-avatar">SR</div><div class="customer-identity-copy"><a href="#customer">'+long+'</a><small>Long company name</small></div>':i===0?'CUST-043':i===2?'Individual':i===5?'₹9,99,99,999.00':i===6?'Active':i===7?'<button>View</button><button>Edit</button>':long)+'</div></td>').join('');
  const shell=body=>'<style>html,body{margin:0;width:100%;font-family:Arial}'+styles+'</style><div class="app-layout"><aside class="bd-sidebar"></aside><div class="app-layout-main"><div class="app-layout-content">'+body+'</div></div></div>';
  const fixtures={customers:'<main class="customers-page"><section class="customer-panel"><div class="customer-table"><table class="MuiTable-root"><thead><tr>'+labels.map((label,index)=>'<th class="MuiTableCell-root MuiTableCell-head">'+(index===1?'<div class="customer-name-heading"><span>Customer</span></div>':index===4?'<div class="customer-contact-heading"><span>Contact</span></div>':index===0?'Customer Code':index===3?'Tax ID / GSTIN':label)+'</th>').join('')+' </tr></thead><tbody><tr class="MuiTableRow-root">'+cells+'</tr><tr class="MuiTableRow-root">'+cells.replaceAll(long,'Shree').replace('Long company name','?').replaceAll('long.customer.billing.address.with.multiple.parts@company.example.com','short@example.com')+'</tr></tbody></table></div></section></main>',details:'<main class="customer-page customer-details-view"><div class="customer-card-grid">'+[1,2].map(()=>'<section class="customer-card"><dl class="customer-fields">'+[1,2,3,4].map(()=>'<div><dt>Contact</dt><dd>'+long+'</dd></div>').join('')+'</dl></section>').join('')+'</div></main>',payments:'<main class="payments-page"><section class="payment-panel"><div class="payment-summary-content"><div>Payment summary</div><dl class="payment-values"><div>'+long+'</div><div>'+long+'</div></dl></div></section></main>',invoices:'<main class="invoice-page"><section class="invoice-panel"><div class="invoice-overview-layout"><dl class="invoice-values"><div>'+long+'</div></dl><dl class="invoice-values"><div>'+long+'</div></dl></div></section></main>'};
  fixtures.inactive=fixtures.customers.replace('class="customer-table"','class="customer-table is-inactive-view"').replace('Individual','Business');
  fixtures.customerPhone='<main class="cust-page"><div class="cust-wizard-layout"><div class="cust-wizard-main"><form class="cust-form cust-wizard-card"><div class="cust-grid cust-grid-2"><div class="cust-field"><label>Email Address</label><div class="cust-input-with-icon"><input type="email" value="customer@example.com"></div></div><div class="cust-field"><label>Mobile / Phone Number</label><div class="cust-phone-group"><div class="country-calling-code-container"><button type="button" class="country-calling-code-trigger">IN +91</button></div><div class="cust-input-with-icon cust-phone-number"><span class="cust-input-icon">+</span><input class="cust-phone-input" type="tel" value="9876543210"></div></div></div></div></form></div><aside>Customer tips</aside></div></main>';
  const summaryLabels=['Total Invoiced','Total Paid','Total Outstanding','Overdue Amount','Overdue Count','Draft Count','Draft Amount'];
  fixtures.invoiceSummary='<main class="invoice-page"><section class="invoice-summary-group"><h2>INR / All invoices</h2><div class="invoice-summary-grid">'+summaryLabels.map((label,index)=>'<button class="invoice-summary-card invoice-kpi-circular-card"><span class="invoice-kpi-label">'+label+'</span><div class="invoice-kpi-donut-wrap">O</div><div class="invoice-kpi-value-block"><strong class="invoice-kpi-value">'+(index===4?'2':index===5?'27':'&#8377;23,95,745.00')+'</strong><small class="invoice-kpi-subtext">Filter invoices</small></div></button>').join('')+'</div></section></main>';
  fixtures.productTypeMenu='<main class="product-page"><div class="product-select-menu MuiPaper-root" style="position:relative;width:min(320px,100%);height:auto;min-height:0;max-height:280px;overflow:auto"><ul class="MuiList-root MuiMenu-list" style="margin:0;padding-inline:0;list-style:none">'+['Select Type','Product','Service'].map(label=>'<li class="MuiMenuItem-root" style="padding:8px 14px;line-height:20px">'+label+'</li>').join('')+'</ul></div></main>';
  const widths=[...new Set([320,375,600,768,960,1024,1100,1179,1180,1279,1280,1281,1366,1536,1920,2400,...[1280,1536,1920].flatMap(base=>[.8,.9,1,1.1,1.25,1.5].map(zoom=>Math.round(base/zoom)))])];
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
      if(name==='productTypeMenu') {
        const typeMenu=await call('Runtime.evaluate',{expression:"JSON.stringify((()=>{const paper=document.querySelector('.product-select-menu').getBoundingClientRect(),items=[...document.querySelectorAll('.MuiMenuItem-root')].map(item=>item.getBoundingClientRect());return {height:paper.height,itemsHeight:items.at(-1).bottom-items[0].top,bottomGap:paper.bottom-items.at(-1).bottom,contained:items.every(item=>item.top>=paper.top&&item.bottom<=paper.bottom)};})())",returnByValue:true});
        const menu=JSON.parse(typeMenu.result.value);
        assert.ok(menu.contained,'Product type options remain inside their popup');
        assert.ok(menu.bottomGap<=6,'Product Type has no excessive empty space after its last option');
        assert.ok(menu.height<=menu.itemsHeight+10,'Product Type popup follows its option content height');
      }
      if(name==='invoiceSummary') {
        const summaryLayout=await call('Runtime.evaluate',{expression:"JSON.stringify((()=>{const grid=document.querySelector('.invoice-summary-grid'),cards=[...grid.children];return {count:cards.length,tops:cards.map(card=>Math.round(card.getBoundingClientRect().top)),heights:cards.map(card=>Math.round(card.getBoundingClientRect().height)),overflow:getComputedStyle(grid).overflowX,values:[...grid.querySelectorAll('.invoice-kpi-value')].map(value=>({width:value.clientWidth,scroll:value.scrollWidth}))};})())",returnByValue:true});
        const summary=JSON.parse(summaryLayout.result.value);
        assert.equal(summary.count,7);
        assert.equal(new Set(summary.tops).size,1,'Invoice summary cards stay in one row at width='+width+' DPR='+dpr);
        assert.equal(new Set(summary.heights).size,1,'Invoice summary cards have consistent heights');
        assert.equal(summary.overflow,'auto','Narrow summary rows scroll within their own container');
        assert.ok(summary.values.every(value=>value.scroll<=value.width+1),'Invoice summary amounts remain readable at width='+width);
      }
      if(name==='customerPhone') {
        const phoneLayout=await call('Runtime.evaluate',{expression:"JSON.stringify((()=>{const input=document.querySelector('.cust-phone-input').getBoundingClientRect(),code=document.querySelector('.country-calling-code-container').getBoundingClientRect(),group=document.querySelector('.cust-phone-group').getBoundingClientRect();return {contained:input.left>=group.left-1&&input.right<=group.right+1,overlap:input.left<code.right-1&&input.right>code.left+1&&input.top<code.bottom-1&&input.bottom>code.top+1};})())",returnByValue:true});
        const phone=JSON.parse(phoneLayout.result.value);
        assert.ok(phone.contained,'Phone input stays inside its form column at width='+width+' DPR='+dpr);
        assert.equal(phone.overlap,false,'Phone input and country selector do not overlap at width='+width+' DPR='+dpr);
      }
      if(name==='customers' || name==='inactive') {
        const positions=await call('Runtime.evaluate',{expression:"JSON.stringify([...document.querySelectorAll('.customer-table tbody tr')].map(row=>{const x=selector=>row.querySelector(selector).getBoundingClientRect().x;return {avatar:x('.customer-avatar'),name:x('.customer-identity-copy a'),company:x('.customer-identity-copy small'),email:x('.customer-email-link'),phone:x('.customer-contact small')};}))",returnByValue:true});
        const rows=JSON.parse(positions.result.value);
        for(const column of ['avatar','name','company','email','phone']) assert.ok(Math.abs(rows[0][column]-rows[1][column])<1,'Different-length names and emails share a consistent starting position: '+column+' width='+width);
        assert.ok(Math.abs(rows[0].name-rows[0].company)<1,'Customer name and company share one text column');
        assert.ok(Math.abs(rows[0].email-rows[0].phone)<1,'Email and phone share one text column');
        const lineCheck=await call('Runtime.evaluate',{expression:"JSON.stringify([...document.querySelectorAll('.customer-balance,.customer-type,.customer-status,.customer-table th')].filter(e=>e.getClientRects().length).map(e=>{const r=document.createRange(),walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),rects=[];let node;while(node=walker.nextNode()){if(node.textContent.trim()){r.selectNodeContents(node);rects.push(...r.getClientRects());}}return {text:e.textContent,lines:new Set(rects.map(rect=>Math.round(rect.top))).size};}))",returnByValue:true});
        for(const value of JSON.parse(lineCheck.result.value)) assert.equal(value.lines,1,'Customer amount, type and headers stay on one line: '+value.text+' width='+width);
        const alignment=await call('Runtime.evaluate',{expression:"JSON.stringify({panel:document.querySelector('.customer-panel').clientWidth,rowDisplay:getComputedStyle(document.querySelector('.customer-table tbody tr')).display,headerDisplay:getComputedStyle(document.querySelector('.customer-table thead')).display,tax:document.querySelector('[data-label=\"Tax ID\"]').getBoundingClientRect().top,contact:document.querySelector('[data-label=\"Contact\"]').getBoundingClientRect().top})",returnByValue:true});
        if(JSON.parse(alignment.result.value).panel>768) {
          const headings=await call('Runtime.evaluate',{expression:"JSON.stringify({name:document.querySelector('.customer-name-heading span').getBoundingClientRect().x,contact:document.querySelector('.customer-contact-heading span').getBoundingClientRect().x})",returnByValue:true});
          const starts=JSON.parse(headings.result.value);
          assert.ok(Math.abs(starts.name-rows[0].name)<1,'Customer heading aligns with names, accounting for the avatar column');
          assert.ok(Math.abs(starts.contact-rows[0].email)<1,'Contact heading aligns with email and phone text');
        }
        const a=JSON.parse(alignment.result.value);assert.equal(a.rowDisplay,a.panel<=768?'grid':'table-row','Customer layout must use cards only at narrow panel widths');assert.equal(a.headerDisplay,a.panel<=768?'none':'table-header-group');if(a.panel>448 && a.panel<=768)assert.ok(Math.abs(a.tax-a.contact)<1,'Tax ID and Contact share one row');
        const emailLayout=await call('Runtime.evaluate',{expression:"JSON.stringify((()=>{const link=document.querySelector('.customer-email-link'),cell=link.closest('td'),style=getComputedStyle(link);return {height:link.getBoundingClientRect().height,lineHeight:parseFloat(style.lineHeight),width:link.getBoundingClientRect().width,cellWidth:cell.clientWidth,scroll:link.scrollWidth,textOverflow:style.textOverflow,outstandingAlignment:getComputedStyle(document.querySelector('[data-label=\"Outstanding\"]')).textAlign};})())",returnByValue:true});
        const email=JSON.parse(emailLayout.result.value);
        assert.ok(email.height<=email.lineHeight+1,'Customer email remains a single line');
        assert.ok(email.width<=email.cellWidth+1,'Customer email stays inside its contact cell');
        assert.ok(email.width<=201,'Email width stays uniform instead of expanding the contact column: '+name+' width='+width+' '+JSON.stringify(email));
        assert.ok(email.scroll>email.width,'Long email is truncated');
        assert.equal(email.textOverflow,'ellipsis');
        assert.equal(email.outstandingAlignment,'center','Outstanding values are centered with the heading and other columns');

      }
      checks++;
    }
  }
  console.log('PASS '+checks+' Chromium layout checks: widths 320-2400; DPR 1/1.25/1.5. Layout fixtures only; not live API or physical laptop QA.');
} finally { socket?.close(); chrome.kill(); }
