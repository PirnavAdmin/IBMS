import { validateQuotationDiscounts } from './utils/quotationDiscount';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { useEffect, useRef, useState } from 'react';
import { Alert, LinearProgress } from '@mui/material';
import { initialQuotationQuery, quotationQuery, quotationPage } from './utils/quotationQuery';
import { quotationApi, normalizeQuotation, normalizeCommunication } from 'billing-api-client/quotationApi.js';
import { QuotationList } from './pages/QuotationList';
import { QuotationForm, newQuotation } from './components/QuotationForm';
import { QuotationDetails } from './pages/QuotationDetails';
import { QuotationDialog } from './components/QuotationDialogs';
import { quotationErrorMessage } from './utils/quotationErrors';
import './styles/quotations.css';
const message = quotationErrorMessage;
export function QuotationManagement() {
  const [quotes,setQuotes]=useState([]), [totalCount,setTotalCount]=useState(0);
  const [params,setParams]=useState(initialQuotationQuery), [search,setSearch]=useState('');
  const [screen,setScreen]=useState('list'), [current,setCurrent]=useState(null), [dialog,setDialog]=useState(null);
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState('');
  const [listFailed,setListFailed]=useState(false);
  const locked=useRef(false), generation=useRef(0);
  const load=async()=>{
    const version=++generation.current; setLoading(true); setError('');
    if(params.search!==search)return;
    try {
      const page=quotationPage(await quotationApi.list(quotationQuery(params)));
      if(version!==generation.current)return;
      setQuotes(page.items.map(normalizeQuotation));setTotalCount(page.totalCount);setListFailed(false);
    }catch(e){if(version===generation.current){setQuotes([]);setListFailed(true);setError(message(e));}}
    finally{if(version===generation.current)setLoading(false);}
  };
  useEffect(()=>{load();return()=>{generation.current++;};},[params]);
  useEffect(()=>{
    const timer=setTimeout(()=>setParams(previous=>({...previous,search,pageNumber:1})),300);
    return()=>clearTimeout(timer);
  },[search]);
  const changeParams=patch=>{generation.current++;setParams(previous=>({...previous,...patch,pageNumber:patch.pageNumber??1}));};
  const changeSearch=value=>{generation.current++;setLoading(true);setSearch(value);};
  const replace=q=>setCurrent(q);
  const backToList=()=>{setScreen('list');load();};
  const run=async task=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError('');
    try{await task();}catch(e){setError(message(e));}finally{locked.current=false;setBusy(false);}
  };
  // Internal refresh must not acquire the mutation lock a second time.
  const refresh=async(mode,q)=>{
    const detail=await quotationApi.get(q.id);replace(detail);
    if(mode==='edit'&&detail.status!=='Draft'){setScreen('details');throw new Error('Only Draft quotations can be edited.');}
    setScreen(mode);
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
    await validateQuotationDiscounts(q.items);
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
    const result=await quotationApi.action(current.id,dialog,reason);const completed=dialog;
    if(completed==='convert'&&Number.isInteger(result))setCurrent(q=>({...q,status:'Converted',convertedInvoiceId:result}));setDialog(null);
    setNotice({send:'Quotation sent.',approve:'Approved.',cancel:'Cancelled.',convert:`Invoice created${Number.isInteger(result)?` (#${result})`:''}.`}[completed]);
    try{await refresh('details',{id:current.id});}catch(e){setScreen('list');await load();setError(`Action completed, but details could not be refreshed. ${message(e)}`);}
  });
  return <>
    {(loading||busy)&&<LinearProgress/>}
    {error&&!dialog&&!(screen==='list'&&listFailed)&&<Alert severity="error" onClose={()=>setError('')} action={['list','details'].includes(screen)?<button disabled={loading||busy} onClick={screen==='details'?()=>open('details',current):load}>Retry</button>:undefined}>{error}</Alert>}
    <fieldset disabled={busy||(loading&&screen!=='list')} style={{border:0,padding:0,margin:0,minWidth:0}} aria-busy={busy||loading}>
      {screen==='create'||screen==='edit'
        ?<QuotationForm key={current?.id||'new'} initial={screen==='edit'?current:newQuotation()} saving={busy} onSave={save} onCancel={()=>current?open('details',current):backToList()}/>
        :screen==='details'&&current
          ?<QuotationDetails quotation={current} onBack={backToList} onEdit={q=>open('edit',q)} onAction={action}/>
          :<QuotationList quotations={quotes} params={params} totalCount={totalCount} search={search} onSearch={changeSearch} onParams={changeParams} loading={loading} loadFailed={listFailed} error={error} onRetry={load} onCreate={()=>{setCurrent(null);setScreen('create');}} onView={q=>open('details',q)} onEdit={q=>open('edit',q)} onAction={action}/>}
      <QuotationDialog key={dialog||'closed'} type={dialog} quotation={current} busy={busy} error={error} onClose={()=>{setDialog(null);setError('');}} onConfirm={transition}/>
    </fieldset>
    <FeedbackSnackbar message={notice} onClose={() => setNotice('')} />
  </>;
}
