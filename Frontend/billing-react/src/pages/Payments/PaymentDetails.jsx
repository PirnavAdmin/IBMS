import { useState } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { Link, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { PaymentShell, PaymentState, PaymentValues, PaymentStatus, usePaymentUser } from './PaymentShared';
import { paymentService, money, displayDate } from './paymentService';
import { PaymentReversal } from './PaymentReversal';

export function PaymentDetails() {
  const [invoiceId,setInvoiceId]=useState(null);
  const invoice=useQuery({queryKey:['payment-balance',invoiceId],queryFn:({signal})=>paymentService.getInvoiceBalance(invoiceId,{signal}),enabled:Boolean(invoiceId),retry:false});
  const {id}=useParams();const location=useLocation();const [notice,setNotice]=useState(location.state?.paymentNotice || ''); const [reversal,setReversal]=useState(false);
  const user=usePaymentUser();const query=useQuery({queryKey:['payments','detail',id],queryFn:({signal})=>paymentService.getPaymentById(id,{signal}),retry:false});const p=query.data;
  return <PaymentShell title="Payment Details" actions={<><Button component={Link} to="/payments">Back to Payments</Button><Button disabled={query.isFetching} onClick={()=>query.refetch()}>Refresh</Button>{p?.isReversible && p.status !== 'Reversed' && user.permissions.reverse && <Button onClick={()=>setReversal(true)}>Reverse Payment</Button>}</>}>
    <FeedbackSnackbar message={notice} onClose={()=>setNotice('')} /><PaymentState loading={query.isPending} error={query.error || user.error} empty={!query.isPending && !p ? 'No payment details available.' : ''} onRetry={()=>{query.refetch();user.refetch();}} />
    {p && <><section className="payment-panel"><h2>Payment Summary</h2><PaymentValues values={[
      ['Payment Number / ID',p.paymentNumber || p.id],['Payment Date',displayDate(p.paymentDate)],['Customer',p.customerName],['Method',p.methodDisplay],['Amount',money(p.amount,p.currency)],['Allocated Amount',money(p.allocatedAmount,p.currency)],['Status',<PaymentStatus status={p.status} />],['Reference',p.reference || p.providerTransactionId || p.chequeNumber],['Notes',p.notes],['Created By',p.createdBy],['Created At',p.createdAtUtc],['Bank',p.bankName],['Provider',p.providerName],['Cheque Status',p.clearingStatus],
    ]} /></section>
    <section className="payment-panel"><h2>Invoice Allocation</h2>{p.allocations.map(a=><div className="payment-allocation" key={a.id}><Button onClick={()=>setInvoiceId(a.invoiceId)}>{a.invoiceNumber}</Button><PaymentValues values={[
      ['Allocated Amount',money(a.allocatedAmount,p.currency)],['Paid Total',money(a.invoicePaidAmount,p.currency)],['Outstanding',money(a.invoiceBalanceAmount,p.currency)],['Invoice Status',a.invoiceStatus],
    ]} /></div>)}{!p.allocations.length && <p>No invoice allocations available.</p>}</section>
    {p.status === 'Reversed' && <section className="payment-panel"><h2>Reversal Information</h2><PaymentValues values={[
      ['Reversal status',p.status],['Reversal Date',p.reversedAtUtc],['Reversal Reason',p.reversalReason],['Reversed By',p.reversedBy],
    ]} /></section>}
    <section className="payment-panel"><h2>Audit Timeline</h2>{p.auditHistory.length ? <ol className="payment-timeline">{p.auditHistory.map(event=><li key={event.id}><strong>{event.action}</strong><p>{event.userName} &middot; {event.timestamp}</p>{event.changes && <details><summary>Changes</summary><pre className="payment-audit-changes">{event.changes}</pre></details>}</li>)}</ol>:<p>No audit history available.</p>}</section></>}
    <Dialog className="payment-dialog" open={Boolean(invoiceId)} onClose={()=>setInvoiceId(null)} fullWidth maxWidth="sm"><DialogTitle>Invoice Details</DialogTitle><DialogContent>
      <PaymentState loading={invoice.isFetching} error={invoice.error} onRetry={()=>invoice.refetch()} />
      {invoice.data && <PaymentValues values={[
        ['Invoice Number',invoice.data.invoiceNumber],['Customer',invoice.data.customerName],['Invoice Date',displayDate(invoice.data.invoiceDate)],['Due Date',displayDate(invoice.data.dueDate)],['Invoice Total',money(invoice.data.invoiceTotal,invoice.data.currency)],['Paid Total',money(invoice.data.previouslyPaid,invoice.data.currency)],['Current Outstanding',money(invoice.data.currentOutstanding,invoice.data.currency)],['Status',invoice.data.status],
      ]} />}
    </DialogContent><DialogActions><Button onClick={()=>setInvoiceId(null)}>Close</Button></DialogActions></Dialog>
    <PaymentReversal open={reversal} onClose={()=>setReversal(false)} paymentId={id} />
  </PaymentShell>;
}
