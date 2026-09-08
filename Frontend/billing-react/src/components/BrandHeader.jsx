import React from 'react';
import { Box, Typography } from '@mui/material';
import { InvoiceBillingLogo } from './InvoiceBillingLogo';

export const BrandHeader = ({ title = 'INVOICE.BILLING', subtitle = 'PORTAL ACCESS' }) => (
  <Box className="login-brand-header">
    <InvoiceBillingLogo size={20} />
    <Box>
      <Typography variant="h5" className="login-brand-text">
        {title.includes('.') ? (
          <>
            {title.split('.')[0]}<span className="login-brand-dot">.</span>{title.split('.')[1]}
          </>
        ) : (
          title
        )}
      </Typography>
      <Typography variant="caption" className="login-brand-sub">
        {subtitle}
      </Typography>
    </Box>
  </Box>
);

export default BrandHeader;