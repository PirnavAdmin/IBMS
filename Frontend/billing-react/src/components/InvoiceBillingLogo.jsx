import React from 'react';
import Box from '@mui/material/Box';

export const InvoiceBillingLogo = ({ size = 24, tone = 'brand', variant = 'crest' }) => {
  const full = variant === 'full';
  return <Box component="span" className={`ibms-logo ibms-logo--${full ? 'full' : 'crest'}`} aria-hidden={full ? undefined : true} data-tone={tone} sx={{
    display: full ? 'block' : 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: full ? '100%' : size + 16, height: full ? 'auto' : size + 16,
    flexShrink: 0, background: 'transparent', borderRadius: 0, boxShadow: 'none',
  }}>
    <Box component="img" src={full ? '/branding/ibms-logo-full.png' : '/branding/ibms-crest.png'}
      alt={full ? 'Invoice Billing Management System — Secure, accurate, reliable' : ''}
      width={full ? 787 : 1254} height={full ? 580 : 1254} decoding="async" draggable={false}
      sx={{ display: 'block', width: '100%', height: full ? 'auto' : '100%', objectFit: 'contain' }} />
  </Box>;
};
