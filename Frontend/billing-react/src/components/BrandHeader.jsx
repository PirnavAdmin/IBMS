import { BrandName } from './BrandName';
import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { InvoiceBillingLogo } from './InvoiceBillingLogo';

export const BrandHeader = ({ title = 'IBMS', subtitle = 'PORTAL ACCESS' }) => (
  <Box className="login-brand-header">
    <InvoiceBillingLogo size={20} />
    {['IBMS', 'INVOICE BILLING MANAGEMENT SYSTEM'].includes(title) ? <BrandName /> : <Box>
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
    </Box>}
  </Box>
);

export default BrandHeader;