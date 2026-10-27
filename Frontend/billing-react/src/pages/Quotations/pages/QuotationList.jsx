import { hasPermission } from "../../../utils/permissionUtils";
import { useEffect, useMemo, useState } from 'react';
import { ListItemIcon, Menu, MenuItem } from '@mui/material';
import { Add, ArrowBack, CancelOutlined, CheckCircleOutline, DescriptionOutlined, EditOutlined, FilterList, History, MoreVert, Search, SendOutlined, SwapHorizOutlined, VisibilityOutlined } from '@mui/icons-material';
import { DashboardErrorState } from '../../../components/dashboard/DashboardStates';
import { displayDate } from '../../../utils/localDate';
import { currency } from '../utils/quotationCalculations';
import { QuotationStatusBadge } from '../components/QuotationStatusBadge';
import { ThemedSelect } from '../components/ThemedSelect';
import { DateRangeFilter } from '../../../components/DateRangeFilter';
import { WorkspacePagination } from '../../../components/WorkspacePagination';
import { compareQuotationCreations, compareQuotationNumbers, compareQuotationUpdates } from '../utils/quotationQuery';
const columns = [['quoteNumber','Quote Number'],['customer','Customer'],['quotationDate','Quote Date'],['validUntil','Valid Until'],['status','Status'],['totalAmount','Amount']];
const auditCategories = ['All categories', 'Created', 'Edited', 'Sent', 'Approved', 'Cancelled', 'Converted', 'Discount Override', 'Status Changes'];
const isExpired = quote => quote.validUntil < new Date().toISOString().slice(0, 10);
const quoteStatusCategory = quote => {
 const status = String(quote?.status || '').trim();
 const mapping = { Draft: 'Created', Sent: 'Sent', Approved: 'Approved', Cancelled: 'Cancelled', Converted: 'Converted' };
 return mapping[status] || 'Created';
};
const labelFromAction = value => {
 const text = String(value || '').trim();
 if (!text) return '';
 const key = text.toLowerCase();
 if (['created','created record','quotation created','draft created','new quotation'].includes(key) || key.includes('creat')) return 'Created';
 if (['edited','updated','changed','modified','amended'].includes(key) || key.includes('edit') || key.includes('updat')) return 'Edited';
 if (['sent','send','emailed','shared'].includes(key) || key.includes('sent')) return 'Sent';
 if (['approved','approval','accepted'].includes(key) || key.includes('approv')) return 'Approved';
 if (['cancelled','canceled','cancelled quotation','rejected'].includes(key) || key.includes('cancel')) return 'Cancelled';
 if (['converted','invoice created','converted to invoice'].includes(key) || key.includes('convert')) return 'Converted';
 if (['discount override','discountoverride','manual discount override'].includes(key) || key.includes('discount')) return 'Discount Override';
 if (['status changes','status changed','status update','status updated'].includes(key) || key.includes('status')) return 'Status Changes';
 return '';
};
const matchesAuditCategory = (quote, category) => {
 if (category === 'All categories' || category === 'All') return true;
 const logs = (Array.isArray(quote.auditLogs) ? quote.auditLogs : [])
   .map(entry => labelFromAction(entry.action || entry.label || entry.type || entry.changes || entry.description))
   .filter(Boolean);
 const stageCategories = ['Created', 'Sent', 'Approved', 'Cancelled', 'Converted'];
 if (stageCategories.includes(category)) return quoteStatusCategory(quote) === category;
 if (category === 'Edited') {
   if (quote.status !== 'Draft') return false;
   const createdAt = Date.parse(quote.createdAtUtc || '');
   const updatedAt = Date.parse(quote.updatedAtUtc || quote.updatedAt || '');
   return logs.includes('Edited') || (!Number.isNaN(updatedAt) && (Number.isNaN(createdAt) || updatedAt > createdAt));
 }
 if (category === 'Discount Override') return logs.includes('Discount Override');
 if (category === 'Status Changes') return logs.includes('Status Changes') || ['Sent', 'Approved', 'Cancelled', 'Converted'].includes(quote.status);
 return false;
};
export function QuotationList({ quotations, customers, onCreate, onView, onEdit, onAction, loading = false, loadFailed = false, error = '', onRetry }) {
 const [search,setSearch]=useState(''); const [filters,setFilters]=useState({status:'All',customer:'',from:'',to:'',validity:'All',sortBy:'newest'}); const [applied,setApplied]=useState(filters); const [filtersOpen,setFiltersOpen]=useState(false); const [auditOpen,setAuditOpen]=useState(false); const [auditCategory,setAuditCategory]=useState(auditCategories[0]); const [quotationsOpen,setQuotationsOpen]=useState(false); const [sort,setSort]=useState({key:'quoteNumber',direction:'asc'}); const [page,setPage]=useState(1); const [pageSize,setPageSize]=useState(5); const [actionAnchor,setActionAnchor]=useState(null); const [actionQuote,setActionQuote]=useState(null);
 useEffect(()=>setPage(1),[search,applied,auditCategory,pageSize]);
 const toggleQuotations=()=>{const next=!quotationsOpen;setQuotationsOpen(next);setFiltersOpen(false);setAuditOpen(false);setPageSizeOpen(false);if(!next)return;const reset={status:'All',customer:'',from:'',to:'',validity:'All',sortBy:'newest'};setSearch('');setFilters(reset);setApplied(reset);setAuditCategory(auditCategories[0]);setSort({key:'quoteNumber',direction:'asc'});setPageSize(5);setPage(1);};
 const filtered=useMemo(()=>quotations.filter(q=>{const query=search.toLowerCase(); const customer=q.customer; const found=!query || [q.quoteNumber,customer.name,customer.code,customer.email,customer.mobile].some(value=>String(value || '').toLowerCase().includes(query)); const validity=applied.validity==='All'||(applied.validity==='Expired'&&isExpired(q))||(applied.validity==='Active'&&!isExpired(q)&&q.validUntil>new Date(Date.now()+7*864e5).toISOString().slice(0,10))||(applied.validity==='Expiring Soon'&&!isExpired(q)&&q.validUntil<=new Date(Date.now()+7*864e5).toISOString().slice(0,10)); return found&&(applied.status==='All'||q.status===applied.status)&&(!applied.customer||q.customerId===applied.customer)&&(!applied.from||q.quotationDate>=applied.from)&&(!applied.to||q.quotationDate<=applied.to)&&validity&&matchesAuditCategory(q,auditCategory);}),[quotations,search,applied,auditCategory]);
 const sorted=useMemo(()=>[...filtered].sort((a,b)=>{if(sort.key==='createdAtUtc')return compareQuotationCreations(a,b,applied.sortBy==='oldest'?'asc':'desc');if(sort.key==='updatedAtUtc')return compareQuotationUpdates(a,b,sort.direction);if(sort.key==='quoteNumber')return compareQuotationNumbers(a,b,sort.direction);const av=sort.key==='customer'?a.customer.name:a[sort.key]; const bv=sort.key==='customer'?b.customer.name:b[sort.key];return String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'})*(sort.direction==='asc'?1:-1)}),[filtered,sort,applied.sortBy]); const paged=sorted.slice((page-1)*pageSize,page*pageSize);
 const recentQuotes=useMemo(()=>[...filtered].sort((a,b)=>compareQuotationCreations(a,b,'desc')).slice(0,5),[filtered]);
 const overview=<section className="quote-overview" aria-label="Recently created quotations"><h3>Recently created quotations</h3>{recentQuotes.length?<div className="quote-table-wrap quote-overview-table-wrap ibms-table-frame"><table className="quote-list-table quote-overview-table"><thead><tr><th>Quote Number</th><th>Customer</th><th>Status</th><th>Amount</th></tr></thead><tbody>{recentQuotes.map(quote=><tr key={quote.id}><td><button className="quote-link" onClick={()=>onView(quote)}>{quote.quoteNumber}</button></td><td>{quote.customer?.name||quote.customerName||'—'}</td><td><QuotationStatusBadge status={quote.status}/></td><td><strong>{currency(quote.totalAmount)}</strong></td></tr>)}</tbody></table></div>:<p className="quote-state">No quotations yet.</p>}</section>;
 const closeActionMenu=()=>{setActionAnchor(null);setActionQuote(null);};
 const performAction=(action)=>{const quote=actionQuote;closeActionMenu();if(!quote)return;if(action==='view')onView(quote);else if(action==='edit')onEdit(quote);else onAction(action,quote);};
 const actionButtons=q=><><button type="button" className="quote-action-icon quote-row-actions-trigger ibms-row-actions-trigger"  aria-label={`Actions for ${q.quoteNumber}`} aria-haspopup="menu" aria-expanded={actionQuote?.id===q.id&&Boolean(actionAnchor)} onClick={event=>{setActionAnchor(event.currentTarget);setActionQuote(q);}}><MoreVert /></button><Menu anchorEl={actionQuote?.id===q.id?actionAnchor:null} PaperProps={{className:'ibms-row-actions-menu'}} anchorOrigin={{vertical:'bottom',horizontal:'right'}} transformOrigin={{vertical:'top',horizontal:'right'}} open={actionQuote?.id===q.id&&Boolean(actionAnchor)} onClose={closeActionMenu}><MenuItem onClick={()=>performAction('view')}><ListItemIcon><VisibilityOutlined fontSize="small" /></ListItemIcon>View quotation</MenuItem>{q.status==='Draft'&&<>{(hasPermission('quotations.edit') || hasPermission('quotations.manage')) && <MenuItem onClick={()=>performAction('edit')}><ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon>Edit draft</MenuItem>}<MenuItem onClick={()=>performAction('send')}><ListItemIcon><SendOutlined fontSize="small" /></ListItemIcon>Send quotation</MenuItem><MenuItem className="is-destructive" onClick={()=>performAction('cancel')}><ListItemIcon><CancelOutlined fontSize="small" /></ListItemIcon>Cancel quotation</MenuItem></>}{q.status==='Sent'&&<>{(hasPermission('quotations.approve') || hasPermission('quotations.manage')) && <MenuItem onClick={()=>performAction('approve')}><ListItemIcon><CheckCircleOutline fontSize="small" /></ListItemIcon>Approve quotation</MenuItem>}<MenuItem className="is-destructive" onClick={()=>performAction('cancel')}><ListItemIcon><CancelOutlined fontSize="small" /></ListItemIcon>Cancel quotation</MenuItem></>}{q.status==='Approved'&&<><MenuItem onClick={()=>performAction('convert')}><ListItemIcon><SwapHorizOutlined fontSize="small" /></ListItemIcon>Convert to invoice</MenuItem><MenuItem className="is-destructive" onClick={()=>performAction('cancel')}><ListItemIcon><CancelOutlined fontSize="small" /></ListItemIcon>Cancel quotation</MenuItem></>}</Menu></>;
 if (loadFailed && !loading) return <main className="quotation-page"><header className="quotation-header quotation-list-header"><div><span className="quote-eyebrow">SALES WORKSPACE</span><h1>Quotation Management</h1><p>Create, manage, send, approve and convert customer quotations.</p></div></header><DashboardErrorState title="Unable to load quotations" message={error} onRetry={onRetry} /></main>;
 return <main className="quotation-page">
  <header className="quotation-header quotation-list-header"><div><span className="quote-eyebrow">SALES WORKSPACE</span><h1>Quotation Management</h1><p>Create, manage, send, approve and convert customer quotations.</p></div>{(hasPermission('quotations.create') || hasPermission('quotations.manage')) && <button className="quote-btn primary" onClick={onCreate}><Add /> Create Quotation</button>}</header>
  <section className="quote-card quote-list-card">
   <div className="quote-list-toolbar">
    <label className="quote-search"><Search/><input placeholder="Search quote, customer, code, email or mobile" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <button aria-label={quotationsOpen?'Hide quotations':'Show quotations'} type="button" className={`quote-btn secondary quote-running-button${quotationsOpen?' active':''}`} aria-pressed={quotationsOpen}  onClick={toggleQuotations}><DescriptionOutlined /> Quotations</button>
    <div className="quote-audit-menu" onMouseEnter={()=>setAuditOpen(true)} onMouseLeave={()=>setAuditOpen(false)}><button className={`quote-btn secondary ${auditOpen ? 'active' : ''}`} aria-expanded={auditOpen} onClick={()=>setAuditOpen(open=>!open)}><History /> Audit</button>{auditOpen&&<div className="quote-audit-dropdown">{auditCategories.map(category=><button key={category} type="button" className={auditCategory===category ? 'active' : ''} onClick={()=>{setAuditCategory(category);setAuditOpen(false);}}><span>{category}</span><small>{category==='All' ? quotations.length : quotations.filter(q=>matchesAuditCategory(q, category)).length}</small></button>)}<button type="button" className="quote-audit-back" onClick={()=>setAuditOpen(false)}><ArrowBack /> Back</button></div>}</div>
    <div className="quote-filter-menu"><button className={`quote-btn secondary ${filtersOpen ? 'active' : ''}`} aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(open=>!open)}><FilterList /> Filters</button>{filtersOpen&&<div className="quote-filter-dropdown">
     <div className="quote-filter-grid">
      <label>Status<ThemedSelect label="Status" value={filters.status} onChange={status=>setFilters({...filters,status})} options={['All','Draft','Sent','Approved','Cancelled','Converted'].map(v=>({value:v,label:v}))}/></label>
      <label>Customer<ThemedSelect label="Customer" value={filters.customer} onChange={customer=>setFilters({...filters,customer})} options={[{value:'',label:'All customers'},...customers.map(c=>({value:c.id,label:c.name}))]}/></label>
      <DateRangeFilter startDate={filters.from} endDate={filters.to} onApply={({ startDate, endDate }) => setFilters({ ...filters, from: startDate, to: endDate })} />
      <label>Validity<ThemedSelect label="Validity" value={filters.validity} onChange={validity=>setFilters({...filters,validity})} options={['All','Active','Expiring Soon','Expired'].map(v=>({value:v,label:v}))}/></label>
      <label>Sort by<ThemedSelect label="Sort by" value={filters.sortBy} onChange={sortBy=>setFilters({...filters,sortBy})} options={[{value:'newest',label:'Newest to Oldest'},{value:'oldest',label:'Oldest to Newest'}]}/></label>
     </div>
     <div className="quote-filter-buttons"><button className="quote-btn primary" onClick={()=>{setApplied({...filters});setSort({key:'createdAtUtc',direction:filters.sortBy==='oldest'?'asc':'desc'});setPage(1);setQuotationsOpen(true);setFiltersOpen(false)}}>Apply Filters</button><button className="quote-btn secondary" onClick={()=>{const reset={status:'All',customer:'',from:'',to:'',validity:'All',sortBy:'newest'};setFilters(reset);setApplied(reset);setSort({key:'quoteNumber',direction:'asc'});setSearch('')}}>Reset Filters</button></div>
    </div>}</div>
   </div>
   {!quotationsOpen&&overview}
   <div className="quote-table-wrap ibms-table-frame"><table className="quote-list-table"><thead><tr>{columns.map(([key,label])=><th key={key}><button onClick={()=>setSort({key,direction:sort.key===key&&sort.direction==='asc'?'desc':'asc'})}>{label} {sort.key===key?(sort.direction==='asc'?'↑':'↓'):''}</button></th>)}<th>Actions</th></tr></thead><tbody>{loading?<tr><td colSpan="7" className="quote-state">Loading quotations…</td></tr>:loadFailed?<tr><td colSpan="7" className="quote-state"><DashboardErrorState title="Unable to load quotations" message={error} onRetry={onRetry} /></td></tr>:!paged.length?<tr><td colSpan="7" className="quote-state">{quotations.length?'No quotations match your search or filters.':'No quotations yet. Create your first quotation.'}</td></tr>:paged.map(q=>{return <tr key={q.id}><td><button className="quote-link" onClick={()=>onView(q)}>{q.quoteNumber}</button></td><td><strong>{q.customer.name}</strong><small>{q.customer.code}</small></td><td>{displayDate(q.quotationDate)}</td><td>{displayDate(q.validUntil)}</td><td><QuotationStatusBadge status={q.status} expired={q.status==='Draft'&&isExpired(q)}/></td><td><strong>{currency(q.totalAmount)}</strong></td><td>{actionButtons(q)}</td></tr>})}</tbody></table></div>
   <WorkspacePagination page={page} pageSize={pageSize} totalCount={sorted.length} itemLabel="quotations" onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} />
  </section>
 </main>;
}
