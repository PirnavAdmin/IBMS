import { useRef, useState } from 'react';
import { Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PaymentShell, PaymentState, PaymentValues, usePaymentUser } from './PaymentShared';
import { paymentService, PAYMENT_METHODS, methodLabel, methodFields, money, paymentError, createPaymentDto, createAttemptManager, createSubmissionGuard, invalidatePaymentData } from './paymentService';
import { paymentSchema, validatePayment } from './paymentValidation';

const initial = {invoice:'',date:'',amount:'',method:'',reference:'',notes:'',bankName:'',accountLabel:'',transferDate:'',upiPayerMetadata:'',chequeNumber:'',chequeDate:'',clearingStatus:'',providerName:'',providerTransactionId:'',callbackStatus:'',customMethodName:''};
const labels={reference:'Transaction Reference',bankName:'Bank',accountLabel:'Account Label',transferDate:'Transfer Date',upiPayerMetadata:'UPI Payer Metadata',chequeNumber:'Cheque Number',chequeDate:'Cheque Date',clearingStatus:'Cheque Clearing Status',providerName:'Provider',providerTransactionId:'Provider Transaction ID',callbackStatus:'Gateway Status',customMethodName:'Custom Method Name'};
export function PaymentConfirmation({open,onClose,onConfirm,busy,values,error}) {
  return <Dialog className="payment-dialog" open={open} onClose={busy?undefined:onClose} fullWidth maxWidth="sm"><DialogTitle>Confirm Payment</DialogTitle><DialogContent><PaymentValues values={values} />{error && <Alert severity="error">{error}</Alert>}</DialogContent><DialogActions><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="contained" disabled={busy} onClick={onConfirm}>{busy?'Recording...':'Confirm Payment'}</Button></DialogActions></Dialog>;
}
export function RecordPayment() {
  const [form,setForm]=useState(initial);const [search,setSearch]=useState('');const [selected,setSelected]=useState(null);
  const [retryRequest,setRetryRequest]=useState(null);const [errors,setErrors]=useState({});const [confirmation,setConfirmation]=useState(null);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const lock=useRef(createSubmissionGuard());const attempt=useRef(createAttemptManager());const client=useQueryClient();const navigate=useNavigate();const user=usePaymentUser();
  const invoices=useQuery({queryKey:['payment-invoices'],queryFn:({signal})=>paymentService.getEligibleInvoices({signal}),retry:false});
  const balance=useQuery({queryKey:['payment-balance',selected?.invoiceId],queryFn:({signal})=>paymentService.getInvoiceBalance(selected.invoiceId,{signal}),enabled:Boolean(selected),retry:false,staleTime:0});
  const current=balance.error?null:balance.data;
  const change=key=>event=>{const value=event.target.value;setForm(previous=>({...previous,[key]:value,...(key==='method'?Object.fromEntries(Object.keys(labels).map(k=>[k,''])):{})}));setErrors(previous=>({...previous,[key]:''}));setConfirmation(null);};
  const review=async event=>{
    event.preventDefault();if(!lock.current.acquire())return;setBusy(true);setMessage('');
    try {
      const result=await validatePayment(paymentSchema,form);setErrors(result.errors);if(Object.keys(result.errors).length)return;
      const fresh=await balance.refetch();if(fresh.error)throw fresh.error;
      if(!fresh.data?.isEligibleForPayment){setMessage(fresh.data?.ineligibilityReason || 'This invoice is not eligible for payment.');return;}
      if(Number(form.amount)>fresh.data.currentOutstanding){setErrors({amount:'Payment exceeds the current outstanding balance.'});return;}
      setConfirmation({values:result.values,invoice:fresh.data});
    } catch(error){setMessage(paymentError(error));} finally{lock.current.release();setBusy(false);}
  };
  const submit=async()=>{
    if(!confirmation || !user.permissions.create || !lock.current.acquire())return;setBusy(true);setMessage('');
    try {
      const dto=confirmation.retryDto || createPaymentDto(confirmation.values,confirmation.invoice);
      if(!dto.idempotencyKey) dto.idempotencyKey=attempt.current.keyFor(dto);
      setRetryRequest({...confirmation,retryDto:dto});
      const payment=await paymentService.createPayment(dto);
      // The confirmed request remains in memory until success; retries retain its key.
      attempt.current.reset();setRetryRequest(null);await invalidatePaymentData(client);
      navigate(`/payments/${encodeURIComponent(payment.id)}`,{replace:true,state:{paymentNotice:'Payment recorded successfully.'}});
    } catch(error){setMessage(paymentError(error));setConfirmation(null);if(error.response?.status && error.response.status < 500) setRetryRequest(null);await balance.refetch();}
    finally{lock.current.release();setBusy(false);}
  };
  const field=(key)=>{
    const options=key==='clearingStatus'?['Cleared','Uncleared','Pending','Bounced']:key==='callbackStatus'?['Completed','Captured','Verified','Pending','Failed']:null;
    return <TextField key={key} select={Boolean(options)} type={key.endsWith('Date')?'date':'text'} label={labels[key]} value={form[key]} onChange={change(key)} InputLabelProps={key.endsWith('Date')?{shrink:true}:undefined} error={Boolean(errors[key])} helperText={errors[key]}>
      {options && [<MenuItem key="none" value="">Select status</MenuItem>,...options.map(option=><MenuItem key={option} value={option}>{option}</MenuItem>)]}
    </TextField>;
  };
  return <PaymentShell title="Record Payment" actions={<Button component={Link} to="/payments">Back to Payments</Button>}>
    <PaymentState loading={invoices.isPending || user.isPending} error={invoices.error || user.error} onRetry={()=>{invoices.refetch();user.refetch();}} />
    <form className="payment-panel" onSubmit={review} noValidate><fieldset disabled={busy || Boolean(retryRequest)} className="payment-fieldset">
      <h2>Invoice &amp; balance</h2><div className="payment-form-grid">
        <Autocomplete options={invoices.data || []} value={selected} inputValue={search} onInputChange={(_,value)=>setSearch(value)} loading={invoices.isFetching} getOptionLabel={option=>`${option.invoiceNumber} - ${option.customerName}`} isOptionEqualToValue={(a,b)=>a.invoiceId===b.invoiceId}
          noOptionsText={invoices.error?'Invoices could not be loaded.':'No eligible invoices available.'} onChange={(_,value)=>{setSelected(value);setForm(previous=>({...previous,invoice:value?String(value.invoiceId):''}));setConfirmation(null);setMessage('');}}
          renderInput={params=><TextField {...params} required label="Invoice Search / Select" error={Boolean(errors.invoice)} helperText={errors.invoice} />} />
        {['Customer','Invoice Total','Previously Paid','Current Outstanding'].map((label,index)=><TextField key={label} label={label} value={current ? [current.customerName,money(current.invoiceTotal,current.currency),money(current.previouslyPaid,current.currency),money(current.currentOutstanding,current.currency)][index] : ''} placeholder="Select an eligible invoice" InputProps={{readOnly:true}} InputLabelProps={{shrink:true}} />)}
      </div><PaymentState loading={Boolean(selected)&&balance.isFetching} error={balance.error} onRetry={()=>balance.refetch()} />
      {current && !current.isEligibleForPayment && <Alert severity="warning">{current.ineligibilityReason || 'This invoice is not eligible for payment.'}</Alert>}
      <h2>Payment information</h2><div className="payment-form-grid">
        <TextField required type="date" label="Payment Date" value={form.date} onChange={change('date')} InputLabelProps={{shrink:true}} error={Boolean(errors.date)} helperText={errors.date} />
        <TextField required type="number" label="Payment Amount" value={form.amount} onChange={change('amount')} inputProps={{min:0.01,step:0.01}} error={Boolean(errors.amount)} helperText={errors.amount} />
        <TextField select required label="Payment Method" value={form.method} onChange={change('method')} error={Boolean(errors.method)} helperText={errors.method}>{PAYMENT_METHODS.map(method=><MenuItem key={method} value={method}>{methodLabel(method)}</MenuItem>)}</TextField>
        {(methodFields[form.method] || []).map(field)}
        <TextField className="payment-full" label="Notes" multiline minRows={3} value={form.notes} onChange={change('notes')} error={Boolean(errors.notes)} helperText={errors.notes || 'Maximum 1000 characters. Never enter card numbers, CVV, PIN, OTP or secrets.'} />
      </div>{message && <Alert severity="error">{message}</Alert>}
      {!user.isPending && !user.permissions.create && <Alert severity="warning">Sign in with an authorized account to record a payment.</Alert>}
      <div className="payment-actions"><Button component={Link} to="/payments" disabled={busy}>Cancel</Button><Button type="submit" variant="contained" disabled={busy || balance.isFetching || invoices.isPending || !user.permissions.create}>Review Payment</Button></div>
    </fieldset>{retryRequest && <Alert severity="warning" action={<Button disabled={busy} onClick={()=>setConfirmation(retryRequest)}>Retry Same Payment</Button>}>The previous request may have completed. Retry the identical request before entering another payment; its idempotency key is preserved.</Alert>}</form>
    <PaymentConfirmation open={Boolean(confirmation)} busy={busy} onClose={()=>setConfirmation(null)} onConfirm={submit} values={confirmation ? [
      ['Invoice Number',confirmation.invoice.invoiceNumber],['Customer',confirmation.invoice.customerName],['Current Outstanding',money(confirmation.invoice.currentOutstanding,confirmation.invoice.currency)],['Payment Amount',money(Number(confirmation.values.amount),confirmation.invoice.currency)],['Payment Method',methodLabel(confirmation.values.method)],['Payment Date',confirmation.values.date],['Reference',confirmation.values.reference || confirmation.values.providerTransactionId || confirmation.values.chequeNumber],
    ] : []} />
  </PaymentShell>;
}
