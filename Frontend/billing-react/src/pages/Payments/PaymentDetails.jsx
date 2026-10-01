import { useState } from 'react';
import { Button } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { PaymentShell, PaymentState, PaymentValues, usePaymentRequest } from './PaymentShared';
import { paymentService } from './paymentService';
import { PaymentReversal } from './PaymentReversal';

export function PaymentDetails() {
  const { id } = useParams();
  const [reversal, setReversal] = useState(false);
  const request = usePaymentRequest();
  return <PaymentShell title="Payment Details" actions={<><Button component={Link} to="/payments">Back to Payments</Button><Button onClick={() => setReversal(true)}>Reverse Payment</Button></>}>
    <PaymentState {...request} empty="No payment details available." onRetry={() => request.run(() => paymentService.getPaymentById(id))} />
    <section className="payment-panel"><h2>Payment Summary</h2><PaymentValues values={['Payment Number / ID', 'Date', 'Customer', 'Method', 'Amount', 'Allocated Amount', 'Status', 'Reference', 'Notes', 'Created By', 'Created At'].map(label => [label, null])} /></section>
    <section className="payment-panel"><h2>Invoice Allocation</h2><PaymentValues values={['Invoice Number', 'Allocated Amount', 'Paid Total', 'Outstanding'].map(label => [label, null])} /><p>No invoice allocations available.</p></section>
    <section className="payment-panel"><h2>Reversal Information</h2><PaymentValues values={['Reversal status', 'Reversal Date', 'Reversal Reason', 'Reversed By'].map(label => [label, null])} /></section>
    <section className="payment-panel"><h2>Audit Timeline</h2><p>No audit history available.</p></section>
    <PaymentReversal open={reversal} onClose={() => setReversal(false)} paymentId={id} />
  </PaymentShell>;
}
