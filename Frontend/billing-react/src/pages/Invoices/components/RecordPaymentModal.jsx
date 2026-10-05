import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material';
import { PaymentsOutlined } from '@mui/icons-material';
import { invoiceApi } from 'billing-api-client';

const PAYMENT_METHODS = [
  'Bank Transfer',
  'UPI',
  'Credit Card',
  'Debit Card',
  'Cash',
  'Cheque',
  'Online Gateway',
];

const resolveCustomerName = (inv) => {
  if (typeof inv?.customerName === 'string' && inv.customerName.trim()) return inv.customerName.trim();
  if (typeof inv?.customer === 'string' && inv.customer.trim()) return inv.customer.trim();
  if (inv?.customer && typeof inv.customer === 'object') {
    return (
      inv.customer.companyName ||
      inv.customer.name ||
      inv.customer.displayName ||
      `${inv.customer.firstName || ''} ${inv.customer.lastName || ''}`.trim() ||
      'Unnamed Customer'
    );
  }
  return 'Unnamed Customer';
};

export const RecordPaymentModal = ({ open, onClose, invoice, onSuccess }) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Bank Transfer');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!invoice) return null;

  const invoiceId = invoice.id || invoice.invoiceNumber;
  const balance = Number(invoice.balanceAmount ?? (invoice.totalAmount || invoice.total || 0));
  const customerName = resolveCustomerName(invoice);
  const rawCustomerId = typeof invoice.customerId !== 'object' ? invoice.customerId : invoice.customer?.id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setError('Please enter a valid payment amount greater than zero.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await invoiceApi.recordPayment({
        invoiceId: Number(invoice.id) || undefined,
        customerId: Number(rawCustomerId) || undefined,
        amount: numAmount,
        method,
        paymentDate: `${paymentDate}T00:00:00Z`,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        currency: invoice.currency || 'INR',
      });

      if (onSuccess) {
        onSuccess(numAmount);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to record payment. Please check your entries.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#543420' }}>
          <PaymentsOutlined /> Record Payment for {invoice.invoiceNumber || invoice.id}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: '16px', pt: '12px !important' }}>
          {error && <Alert severity="error">{error}</Alert>}

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: '#fbf9f6',
            borderRadius: '6px',
            border: '1px solid #ebdccb'
          }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#8c7d71' }}>Customer</span>
              <strong style={{ display: 'block', fontSize: '0.95rem' }}>{customerName}</strong>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.8rem', color: '#8c7d71' }}>Outstanding Balance</span>
              <strong style={{ display: 'block', fontSize: '1.05rem', color: '#b33927' }}>
                ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </div>

          <TextField
            label="Payment Amount (₹)"
            type="number"
            required
            fullWidth
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputProps={{ min: '0.01', step: 'any', max: balance > 0 ? balance : undefined }}
            helperText={`Maximum payable: ₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <TextField
              label="Payment Date"
              type="date"
              required
              fullWidth
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Payment Method"
              select
              required
              fullWidth
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {PAYMENT_METHODS.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
          </div>

          <TextField
            label="Reference / Transaction ID (Optional)"
            placeholder="e.g. UTR / Cheque / Bank Ref #"
            fullWidth
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />

          <TextField
            label="Notes (Optional)"
            multiline
            rows={2}
            fullWidth
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, backgroundColor: '#fcfaf7' }}>
          <Button onClick={onClose} disabled={loading} variant="outlined" sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{
              backgroundColor: '#70472f',
              '&:hover': { backgroundColor: '#583623' },
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            {loading ? <CircularProgress size={20} color="inherit" /> : 'Record Payment'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default RecordPaymentModal;
