import React from 'react';
import { Typography } from '@mui/material';
import { QrCode2, Verified, CheckCircleOutline } from '@mui/icons-material';

export const TaxInvoiceSheet = ({ inv, isSelected, onSelect }) => (
  <div
    className={`tax-invoice-sheet ${isSelected ? 'sheet-highlight' : ''}`}
    onClick={() => onSelect && onSelect(inv.id)}
  >
    {/* 1. Header: Brand Logo & Template Title */}
    <div className="invoice-sheet-top">
      <div className="sheet-company-block">
        <div className={`company-logo-badge ${inv.logoType}`}>
          <span className="logo-text">{inv.logoText || inv.company}</span>
        </div>
        <Typography variant="subtitle2" className="sheet-company-name">
          {inv.company}
        </Typography>
        <Typography variant="caption" className="sheet-company-tagline">
          {inv.tagline}
        </Typography>
      </div>

      <div className="sheet-title-badge">
        <span className="tax-inv-label">TAX INVOICE</span>
        <span className="template-format-chip">{inv.badge || 'GST Ready'}</span>
      </div>
    </div>

    {/* 2. Abstract Invoice Structure (Clean Skeleton Layout - Sensitive Personal Data Hidden) */}
    <div className="sheet-abstract-meta">
      <div className="abstract-bar bar-long" />
      <div className="abstract-bar bar-medium" />
      <div className="abstract-bar bar-short" />
    </div>

    {/* 3. Invoice Table Header with Abstract Line Items (No Personal Info, Calculations or Prices) */}
    <div className="sheet-table-wrapper">
      <table className="sheet-table">
        <thead>
          <tr>
            <th>Item Description</th>
            <th>HSN / SAC</th>
            <th>Tax Slab</th>
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><div className="abstract-table-bar w-80" /></td>
            <td><div className="abstract-table-bar w-50" /></td>
            <td><div className="abstract-table-bar w-40" /></td>
            <td style={{ textAlign: 'right' }}><div className="abstract-table-bar w-60 ml-auto" /></td>
          </tr>
          <tr>
            <td><div className="abstract-table-bar w-65" /></td>
            <td><div className="abstract-table-bar w-50" /></td>
            <td><div className="abstract-table-bar w-40" /></td>
            <td style={{ textAlign: 'right' }}><div className="abstract-table-bar w-55 ml-auto" /></td>
          </tr>
          <tr>
            <td><div className="abstract-table-bar w-75" /></td>
            <td><div className="abstract-table-bar w-50" /></td>
            <td><div className="abstract-table-bar w-40" /></td>
            <td style={{ textAlign: 'right' }}><div className="abstract-table-bar w-70 ml-auto" /></td>
          </tr>
        </tbody>
      </table>
    </div>

    {/* 4. Format Capabilities Pills */}
    <div className="sheet-features-row">
      {inv.features && inv.features.map((feat, idx) => (
        <span key={idx} className="sheet-feat-pill">
          <CheckCircleOutline sx={{ fontSize: 13, color: '#9A4F2F' }} />
          <span>{feat}</span>
        </span>
      ))}
    </div>

    {/* 5. Footer: Dynamic QR & Official Digital Seal Stamp */}
    <div className="sheet-footer-clean">
      <div className="upi-qr-block">
        <div className="qr-box">
          <QrCode2 sx={{ fontSize: 40, color: '#2D211C' }} />
        </div>
        <span className="qr-sub">Instant UPI Ready</span>
      </div>

      <div className="digital-stamp">
        <Verified sx={{ fontSize: 16, color: '#9A4F2F' }} />
        <div className="stamp-text-group">
          <span className="stamp-main">Digitally Signed</span>
          <span className="stamp-sub">GST Standard Verified</span>
        </div>
      </div>
    </div>
  </div>
);

export default TaxInvoiceSheet;
