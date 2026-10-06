import { useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { PaymentValues, PaymentState, usePaymentUser } from './PaymentShared';
import { paymentService, paymentError, money, invalidatePaymentData, createAttemptManager, createSubmissionGuard } from './paymentService';
import { reversalSchema, validatePayment } from './paymentValidation';

export function PaymentReversalContent({ reason, onChange, error, payment }) {
  return <><PaymentValues values={[
    ['Payment Number',payment?.paymentNumber],['Payment Amount',payment && money(payment.amount,payment.currency)],['Allocated Amount',payment && money(payment.allocatedAmount,payment.currency)],
    ['Affected Invoice',payment?.invoiceDisplay], ...((payment?.allocations || []).map(a => [`${a.invoiceNumber} Outstanding`,money(a.invoiceBalanceAmount,payment.currency)])),
  ]} /><Alert severity="warning">Reversing this payment will update the invoice paid and outstanding balance.</Alert>
    <TextField fullWidth required multiline minRows={3} margin="normal" label="Reversal Reason" value={reason} onChange={onChange} error={Boolean(error)} helperText={error || '3 to 500 characters'} />
  </>;
}
export function PaymentReversal({ open, onClose, paymentId }) {
  const [reason,setReason] = useState(''); const [error,setError] = useState(''); const [message,setMessage] = useState(''); const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false); const lock = useRef(createSubmissionGuard()); const attempt = useRef(createAttemptManager());
  const client = useQueryClient(); const user = usePaymentUser();
  const query = useQuery({ queryKey:['payments','detail',paymentId],queryFn:({signal})=>paymentService.getPaymentById(paymentId,{signal}),enabled:open && Boolean(paymentId),retry:false,staleTime:0 });
  const allowed = Boolean(query.data?.isReversible && query.data.status !== 'Reversed' && user.permissions.reverse && !query.isFetching && !query.error);
  const close = () => { if(!busy) {setReason('');setError('');setMessage('');attempt.current.reset();onClose();} };
  const submit = async () => {
    if(!allowed || !lock.current.acquire()) return;setBusy(true);setMessage('');
    try {
      const result = await validatePayment(reversalSchema,{reason});setError(result.errors.reason || ''); if(result.errors.reason) return;
      await paymentService.reversePayment(paymentId,result.values.reason,attempt.current.keyFor({paymentId,reason:result.values.reason}));
      await invalidatePaymentData(client); setNotice('Payment reversed.');setReason('');attempt.current.reset();onClose();
    } catch(err) {setMessage(paymentError(err)); await query.refetch();}
    finally {lock.current.release();setBusy(false);}
  };
  return <><Dialog className="payment-dialog" open={open} onClose={busy?undefined:close} fullWidth maxWidth="sm"><DialogTitle>Reverse Payment</DialogTitle><DialogContent>
    <PaymentState loading={query.isFetching} error={query.error || user.error} onRetry={()=>{query.refetch();user.refetch();}} />
    {query.data && !query.data.isReversible && <Alert severity="info">This payment cannot be reversed.</Alert>}
    {!user.isPending && !user.permissions.reverse && <Alert severity="warning">You do not have permission to reverse payments.</Alert>}
    <PaymentReversalContent payment={query.data} reason={reason} onChange={e=>{setReason(e.target.value);setError('');}} error={error} />
    {message && <Alert severity="error">{message}</Alert>}
  </DialogContent><DialogActions><Button onClick={close} disabled={busy}>Cancel</Button><Button color="error" variant="contained" disabled={busy || !allowed} onClick={submit}>{busy?'Reversing...':'Confirm Reversal'}</Button></DialogActions></Dialog><FeedbackSnackbar message={notice} onClose={()=>setNotice('')} /></>;
}
