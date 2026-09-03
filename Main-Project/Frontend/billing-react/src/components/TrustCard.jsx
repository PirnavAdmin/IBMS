import React from 'react';
import { CheckCircle } from '@mui/icons-material';

const LIVE_FLASHCARDS = [
  { brand: 'Asian Paints', event: 'Invoice #8942 Settled', amount: '₹1,24,500', icon: '🎨' },
  { brand: 'ICICI Bank', event: 'Auto-Reconciled 100%', amount: '0.4s', icon: '🏦' },
  { brand: 'HSBC Global', event: 'Multi-Currency Cleared', amount: '$48,200', icon: '🛡️' },
  { brand: 'Kotak Bank', event: 'Virtual Payout Settled', amount: 'Instant', icon: '⚡' },
  { brand: 'HDFC Bank', event: 'E-Invoice Validated', amount: 'NIC Live', icon: '🏛️' },
  { brand: 'Stripe Pay', event: 'Batch Reconciled', amount: '₹88,400', icon: '💳' },
];

export const TrustCard = ({
  headline = '₹500 Cr+ Processed',
  subheadline = '99.99% Uptime',
  chips = ['Bank-Level Security', 'Fast & Reliable', 'Data Encrypted'],
}) => (
  <div className="login-trust-wrapper">
    <div className="login-trust-card">
      <div className="trust-metric-box">
        <CheckCircle sx={{ fontSize: 16, color: '#10b981' }} />
        <div>
          <span className="trust-metric-val">{headline}</span>
          <span className="trust-metric-lbl"> &bull; {subheadline}</span>
        </div>
      </div>
      <div className="trust-badges-row">
        {chips.map((chip, idx) => (
          <span key={idx} className="trust-chip">{chip}</span>
        ))}
      </div>
    </div>

    {/* Moving Live Brand & Settlement Flashcard Ticker */}
    <div className="trust-ticker-container">
      <div className="trust-ticker-track">
        {LIVE_FLASHCARDS.concat(LIVE_FLASHCARDS).map((item, idx) => (
          <div key={idx} className="trust-ticker-item">
            <span className="ticker-item-icon">{item.icon}</span>
            <div className="ticker-item-text">
              <span className="ticker-brand">{item.brand}</span>
              <span className="ticker-event">{item.event}</span>
            </div>
            <span className="ticker-amount">{item.amount}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default TrustCard;