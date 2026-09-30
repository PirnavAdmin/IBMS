import { useEffect, useState } from 'react';
import { getCustomers } from '../../Customers/api/customerApi';
import { getCustomerDetails } from '../../Customers/api/customerService';
import { productService } from '../../Products/services/productService';
import { quotationErrorMessage } from '../utils/quotationErrors';

export const isSelectableProduct = product => product.status === 'Active' && product.isActive !== false;
export function QuotationLookup({ kind, value, label = '', onSelect, disabled = false, activeOnly = true }) {
  const [search,setSearch]=useState(''), [page,setPage]=useState(1), [rows,setRows]=useState([]);
  const [total,setTotal]=useState(0), [open,setOpen]=useState(false), [loading,setLoading]=useState(false), [error,setError]=useState('');
  useEffect(()=>{
    if(!open)return;
    let active=true;setLoading(true);setError('');
    const timer=setTimeout(async()=>{
      try {
        const result=kind==='customer'
          ? await getCustomers({search,page,pageSize:10,status:activeOnly?'active':''})
          : await productService.getProducts({search,pageNumber:page,pageSize:10,status:'Active'});
        if(active){setRows(kind==='product'?result.items.filter(isSelectableProduct):result.items);setTotal(result.totalCount);}
      }catch(e){if(active){setRows([]);setError(quotationErrorMessage(e));}}
      finally{if(active)setLoading(false);}
    },300);
    return()=>{active=false;clearTimeout(timer);};
  },[search,page,open,kind,activeOnly]);
  async function select(row) {
    setLoading(true);setError('');
    try {
      const detail=kind==='customer'?(await getCustomerDetails(row.id)).customer:await productService.getProductById(row.id);
      if(kind==='product'&&!isSelectableProduct(detail))throw new Error('This product is inactive. Choose an active product.');
      await onSelect(detail);setOpen(false);setSearch('');
    }catch(e){setError(quotationErrorMessage(e));}finally{setLoading(false);}
  }
  return <div className="quote-picker">
    <input aria-label={`Search ${kind}`} placeholder={value?(label||`Selected ${kind} #${value}`):`Search ${kind}`} value={search} disabled={disabled} onFocus={()=>setOpen(true)} onChange={e=>{setSearch(e.target.value);setPage(1);setOpen(true);}} />
    {value&&<small>{label||`Selected ${kind} #${value}`} <button type="button" disabled={disabled||loading} onClick={()=>onSelect(null)}>Clear</button></small>}
    {error&&<small className="quote-error" role="alert">{error}</small>}
    {open&&!disabled&&<div className="quote-picker-menu" role="listbox" aria-label={`${kind} results`}>
      {loading?<p role="status">Loading?</p>:rows.length?rows.map(row=><button type="button" role="option" aria-selected={String(row.id)===String(value)} key={row.id} onClick={()=>select(row)}>{row.name} ({row.customerCode||row.productCode||row.code})</button>):<p>No matches.</p>}
      <button type="button" disabled={loading||page===1} onClick={()=>setPage(page-1)}>Previous</button>
      <button type="button" disabled={loading||page*10>=total} onClick={()=>setPage(page+1)}>Next</button>
      <button type="button" onClick={()=>setOpen(false)}>Close</button>
    </div>}
  </div>;
}
