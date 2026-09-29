import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { useEffect, useRef, useState } from 'react';
import { Alert, LinearProgress } from '@mui/material';
import { apiClient } from 'billing-api-client/apiClient.js';
import { quotationApi, normalizeQuotation, normalizeQuotationProduct, normalizeCommunication, unwrap, fetchAllPages } from 'billing-api-client/quotationApi.js';
import { parseCustomerResponse } from 'billing-contracts/customer.contracts.js';
import { saveInvoice } from '../../data/billingStore';
import { QuotationList } from './pages/QuotationList';
import { QuotationForm, newQuotation } from './components/QuotationForm';
import { QuotationDetails } from './pages/QuotationDetails';
import { QuotationDialog } from './components/QuotationDialogs';
import { quotationErrorMessage } from './utils/quotationErrors';
import './styles/quotations.css';
const address = value => typeof value === 'string' ? value : Object.values(value || {}).filter(v => typeof v === 'string' && v).join(', ');
const message = quotationErrorMessage;
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
      setError([...new Set(results.filter(r=>r.status==='rejected').map(r=>message(r.reason)))].join(' '));
    }catch(e){setListFailed(true);setError(message(e));}finally{setLoading(false);}
  };
  useEffect(()=>{load();return()=>{generation.current++;};},[]);
  const enrich=q=>({...q,customer:{...q.customer,...(customers.find(c=>c.id===q.customerId)||{})}});
  const replace=q=>{setQuotes(rows=>[q,...rows.filter(row=>row.id!==q.id)]);setCurrent(q);};
  const run=async task=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError('');
    try{await task();}catch(e){setError(message(e));}finally{locked.current=false;setBusy(false);}
  };
  // Internal refresh must not acquire the mutation lock a second time.
  const refresh=async(mode,q)=>{
    const detail=await quotationApi.get(q.id);replace(detail);setScreen(mode);
    if(mode==='details'){
      const results=await Promise.allSettled([quotationApi.communication(q.id),quotationApi.audit(q.id)]);
      const [communication,audit]=results;
      replace({...detail,
        communications:communication.status==='fulfilled'&&Array.isArray(communication.value)?communication.value.map(normalizeCommunication):detail.communications,
        auditLogs:audit.status==='fulfilled'&&Array.isArray(audit.value)?audit.value.map(e=>({...e,date:e.timestamp||e.date,user:e.userName||e.user,description:e.changes||e.description})):[],
      });
      const failure=results.find(r=>r.status==='rejected');if(failure)setError(`History could not be loaded. ${message(failure.reason)}`);
    }
  };
  const open=(mode,q)=>run(()=>refresh(mode,q));
  const save=q=>run(async()=>{
    const saved=await quotationApi.save(q);
    replace(saved);setScreen('details');setNotice('Draft saved.');
    try{await refresh('details',saved);}
    catch(e){setError(`Quotation saved, but details could not be refreshed. ${message(e)}`);}
  });
  const action=(type,q)=>run(async()=>{
    const detail=await quotationApi.get(q.id);replace({...detail,communications:current?.id===detail.id?current.communications:detail.communications,auditLogs:current?.id===detail.id?current.auditLogs:detail.auditLogs});
    const allowed={send:['Draft'],approve:['Sent'],cancel:['Draft','Sent','Approved'],convert:['Approved']};
    if(!allowed[type]?.includes(detail.status))throw new Error(`This quotation is ${detail.status}. The requested action is no longer available.`);
    setDialog(type);
  });
  const transition=reason=>run(async()=>{
    const res = await quotationApi.action(current.id,dialog,reason);const completed=dialog;setDialog(null);
    setNotice({send:'Quotation sent.',approve:'Approved.',cancel:'Cancelled.',convert:'Invoice created.'}[completed]);
    if (completed === 'convert' && current) {
      const invId = current.quoteNumber ? current.quoteNumber.replace(/^QT-?/i, 'INV-') : `INV-${Date.now()}`;
      try {
        saveInvoice({
          id: invId,
          customer: current.customer?.name || current.customerName || 'Customer',
          email: current.customer?.email || current.customerEmail || '',
          issueDate: new Date().toISOString().slice(0, 10),
          dueDate: current.validUntil?.slice(0, 10) || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          total: Number(current.totalAmount || 0),
          status: 'draft',
          items: current.items || [],
          notes: current.notes || '',
          terms: current.termsAndConditions || '',
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Could not cache converted invoice:', err);
      }
    }
    try{await refresh('details',{id:current.id});}catch(e){setScreen('list');await load();setError(`Action completed, but details could not be refreshed. ${message(e)}`);}
  });
  return <>
    {(loading||busy)&&<LinearProgress/>}
    {error&&!dialog&&!(screen==='list'&&listFailed)&&<Alert severity="error" onClose={()=>setError('')} action={['list','details'].includes(screen)?<button disabled={loading||busy} onClick={screen==='details'?()=>open('details',current):load}>Retry</button>:undefined}>{error}</Alert>}
    <fieldset disabled={busy||loading} style={{border:0,padding:0,margin:0,minWidth:0}} aria-busy={busy||loading}>
      {screen==='create'||screen==='edit'
        ?<QuotationForm key={current?.id||'new'} initial={screen==='edit'?enrich(current):newQuotation()} customers={customers.filter(c=>c.isActive!==false||c.id===current?.customerId)} products={products} onSave={save} onCancel={()=>current?open('details',current):setScreen('list')}/>
        :screen==='details'&&current
          ?<QuotationDetails quotation={enrich(current)} onBack={()=>setScreen('list')} onEdit={q=>open('edit',q)} onAction={action}/>
          :<QuotationList quotations={quotes.map(enrich)} customers={customers} loading={loading} loadFailed={listFailed} error={error} onRetry={load} onCreate={()=>{setCurrent(null);setScreen('create');}} onView={q=>open('details',q)} onEdit={q=>open('edit',q)} onAction={action}/>}
      <QuotationDialog key={dialog||'closed'} type={dialog} quotation={current&&enrich(current)} error={error} onClose={()=>{setDialog(null);setError('');}} onConfirm={transition}/>
    </fieldset>
    <FeedbackSnackbar message={notice} onClose={() => setNotice('')} />
  </>;
}
