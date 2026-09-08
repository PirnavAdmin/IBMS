import React from 'react';
import { Typography } from '@mui/material';
import { WhatsApp, Check } from '@mui/icons-material';

export const HeroMockup = () => (
  <div className="hero-mockup-wrapper">
    {/* Floating Invoice Sent Card */}
    <div className="hero-card-invoice">
      <div className="mockup-card-header">
        <span className="mockup-brand-tag">Invoice.billing</span>
        <span className="mockup-status-paid">PAID ✓</span>
      </div>
      <div className="mockup-card-body">
        <div className="mockup-bill-line header">
          <span>TAX INVOICE</span>
          <span className="mockup-inv-id">#AMZ-8921</span>
        </div>
        <div className="mockup-divider" />
        <div className="mockup-bill-line">
          <span>Samsung Galaxy 5G</span>
          <span className="mockup-amt">₹16,999</span>
        </div>
        <div className="mockup-bill-line">
          <span>GST (18% Tax)</span>
          <span className="mockup-amt">₹2,974</span>
        </div>
        <div className="mockup-divider" />
        <div className="mockup-bill-total">
          <span>Total Settled</span>
          <span className="total-highlight">₹19,498.00</span>
        </div>
      </div>
      <div className="whatsapp-sent-bubble">
        <WhatsApp sx={{ fontSize: 16, color: '#25d366' }} />
        <span>Invoice Sent on WhatsApp!</span>
      </div>
    </div>

    {/* Floating Payment Received Phone Mockup */}
    <div className="hero-phone-mockup">
      <div className="phone-screen">
        <div className="phone-check-circle">
          <Check sx={{ fontSize: 26, color: '#ffffff' }} />
        </div>
        <Typography variant="subtitle2" className="phone-success-title">
          Payment Received!
        </Typography>
        <Typography variant="h5" className="phone-success-amount">
          ₹19,498.00
        </Typography>
        <div className="phone-payment-method">
          <span>UPI Auto-Reconciled</span>
        </div>
      </div>
    </div>
  </div>
);

export default HeroMockup;
