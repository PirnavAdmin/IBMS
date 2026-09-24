import { useEffect, useRef, useState } from 'react';
import { Alert, LinearProgress, Snackbar } from '@mui/material';
import { apiClient } from 'billing-api-client/apiClient.js';
import { quotationApi, normalizeQuotation, normalizeQuotationProduct, normalizeCommunication, unwrap, fetchAllPages } from 'billing-api-client/quotationApi.js';
import { parseCustomerResponse } from 'billing-contracts/customer.contracts.js';
import { QuotationList } from './pages/QuotationList';
import { QuotationForm, newQuotation } from './components/QuotationForm';
import { QuotationDetails } from './pages/QuotationDetails';
import { QuotationDialog } from './components/QuotationDialogs';
import './styles/quotations.css';
const address = value => typeof value === 'string' ? value : Object.values(value || {}).filter(v => typeof v === 'string' && v).join(', ');
const message = e => e.response?.status === 401 ? 'Please sign in to load quotations.' : e.response?.status === 403 ? 'Your account does not have access to these quotations.' : e.message;
export function QuotationManagement() {
  const [quotes,setQuotes]=useState([]), [customers,setCustomers]=useState([]), [products,setProducts]=useState([]);
  const [screen,setScreen]=useState('list'), [current,setCurrent]=useState(null), [dialog,setDialog]=useState(null);
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState('');
  const [listFailed,setListFailed]=useState(false);
  const locked=useRef(false), generation=useRef(0);
  const load=async()=>{
    const version=++generation.current; setLoading(true); setError('');
    const results=await Promise.allSettled([
      fetchAllPages(quotationApi.list),
      fetchAllPages(async params=>unwrap(await apiClient.get('/api/v1/customers',{params}))),
      fetchAllPages(async params=>unwrap(await apiClient.get('/api/v1/products',{params}))),
    ]);
    if(version!==generation.current)return;
    try {
      const [q,c,p]=results; setListFailed(q.status==='rejected');
      if(q.status==='fulfilled')setQuotes(q.value.map(normalizeQuotation));
      if(c.status==='fulfilled')setCustomers(c.value.map(parseCustomerResponse).filter(Boolean).map(row=>({...row,id:String(row.id),code:row.customerCode,mobile:row.phone,billingAddress:address(row.billingAddress),shippingAddress:address(row.shippingAddress),taxInfo:row.taxId||''})));
      if(p.status==='fulfilled')setProducts(p.value.filter(row=>row.isActive!==false&&row.status!=='Inactive').map(normalizeQuotationProduct));
      setError(results.map((r,i)=>r.status==='rejected'?`${['Quotations','Customers','Products'][i]}: ${message(r.reason)}`:'').filter(Boolean).join(' '));
    }catch(e){setListFailed(true);setError(message(e));}finally{setLoading(false);}
  };
  useEffect(()=>{load();return()=>{generation.current++;};},[]);
  const enrich=q=>({...q,customer:{...q.customer,...(customers.find(c=>c.id===q.customerId)||{})}});
  const replace=q=>{setQuotes(rows=>[q,...rows.filter(row=>row.id!==q.id)]);setCurrent(q);};
  const run=async task=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError('');
    try{await task();}catch(e){setError(message(e));}finally{locked.current=false;setBusy(false);}
  };
  const open=(mode,q)=>run(async()=>{
    const detail=await quotationApi.get(q.id);setCurrent(detail);setScreen(mode);
    if(mode==='details'){
      const results=await Promise.allSettled([quotationApi.communication(q.id),quotationApi.audit(q.id)]);
      const [communication,audit]=results;
      setCurrent({...detail,
        communications:communication.status==='fulfilled'&&Array.isArray(communication.value)?communication.value.map(normalizeCommunication):detail.communications,
        auditLogs:audit.status==='fulfilled'&&Array.isArray(audit.value)?audit.value.map(e=>({...e,date:e.timestamp||e.date,user:e.userName||e.user,description:e.changes||e.description})):[],
      });
      const failure=results.find(r=>r.status==='rejected');if(failure)setError(`History could not be loaded. ${message(failure.reason)}`);
    }
  });
  const save=q=>run(async()=>{replace(await quotationApi.save(q));setScreen('details');setNotice('Quotation draft saved.');});
  const action=(type,q)=>run(async()=>{
    const detail=await quotationApi.get(q.id);replace(detail);
    const allowed={send:['Draft'],approve:['Sent'],cancel:['Draft','Sent','Approved'],convert:['Approved']};
    if(!allowed[type]?.includes(detail.status))throw new Error(`This quotation is ${detail.status}. The requested action is no longer available.`);
    setDialog(type);
  });
  const transition=reason=>run(async()=>{
    await quotationApi.action(current.id,dialog,reason);const completed=dialog;setDialog(null);
    setNotice({send:'Quotation marked as sent.',approve:'Quotation approved.',cancel:'Quotation cancelled.',convert:'Quotation converted to invoice.'}[completed]);
    try{replace(await quotationApi.get(current.id));}catch(e){setScreen('list');await load();setError(`Action completed, but details could not be refreshed. ${message(e)}`);}
  });
  return <>
    {(loading||busy)&&<LinearProgress/>}
    {error&&<Alert severity="error" action={screen==='list'?<button disabled={loading||busy} onClick={load}>Retry</button>:undefined}>{error}</Alert>}
    <fieldset disabled={busy||loading} style={{border:0,padding:0,margin:0,minWidth:0}} aria-busy={busy||loading}>
      {screen==='create'||screen==='edit'
        ?<QuotationForm key={current?.id||'new'} initial={screen==='edit'?enrich(current):newQuotation()} customers={customers.filter(c=>c.isActive!==false||c.id===current?.customerId)} products={products} onSave={save} onCancel={()=>setScreen(current?'details':'list')}/>
        :screen==='details'&&current
          ?<QuotationDetails quotation={enrich(current)} onBack={()=>setScreen('list')} onEdit={q=>open('edit',q)} onAction={action}/>
          :<QuotationList quotations={quotes.map(enrich)} customers={customers} loading={loading} loadFailed={listFailed} onCreate={()=>{setCurrent(null);setScreen('create');}} onView={q=>open('details',q)} onEdit={q=>open('edit',q)} onAction={action}/>}
      <QuotationDialog key={dialog||'closed'} type={dialog} quotation={current&&enrich(current)} error={error} onClose={()=>setDialog(null)} onConfirm={transition}/>
    </fieldset>
    <Snackbar open={!!notice} autoHideDuration={5000} onClose={()=>setNotice('')}><Alert severity="success">{notice}</Alert></Snackbar>
  </>;
}
