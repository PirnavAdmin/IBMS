import React from 'react';
import { Box, Typography } from '@mui/material';
import { ReceiptLong } from '@mui/icons-material';

export const BrandHeader = ({ title = 'INVOICE.BILLING', subtitle = 'PORTAL ACCESS', icon: Icon = ReceiptLong }) => (
  <Box className="login-brand-header">
    <div className="login-brand-badge">
      <Icon sx={{ color: '#fff', fontSize: 20 }} />
    </div>
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