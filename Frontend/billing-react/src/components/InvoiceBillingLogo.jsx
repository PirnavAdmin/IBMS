import React from 'react';
import { Box } from '@mui/material';
import { ReceiptLong } from '@mui/icons-material';

export const InvoiceBillingLogo = ({ size = 24, tone = 'brand' }) => (
  <Box component="span" aria-hidden="true" sx={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: size + 16, height: size + 16, flexShrink: 0,
    background: tone === 'auth' ? '#F5ECE3' : '#9A4F2F', borderRadius: '12px',
    boxShadow: tone === 'auth' ? 'none' : '0 4px 14px rgba(154, 79, 47, 0.35)',
  }}>
    <ReceiptLong sx={{ color: tone === 'auth' ? '#9A4F2F' : '#ffffff', fontSize: size }} />
  </Box>
);
