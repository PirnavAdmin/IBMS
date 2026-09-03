import React from 'react';
import { Box, Typography } from '@mui/material';
import { SyncAlt, SecurityOutlined, TrendingUp } from '@mui/icons-material';

export const DEFAULT_FEATURES = [
  { icon: <SyncAlt sx={{ fontSize: 20 }} />, title: 'Automatic Payment Tracking', desc: 'Match bank payments to your invoices automatically without any manual work.' },
  { icon: <SecurityOutlined sx={{ fontSize: 20 }} />, title: 'Safe & Protected Records', desc: 'Every invoice and payment is safely stored with industry-standard encryption.' },
  { icon: <TrendingUp sx={{ fontSize: 20 }} />, title: 'Simple Recurring Billing', desc: 'Set up repeating customer plans and let the system bill them on schedule.' },
];

export const FeatureStack = ({ features = DEFAULT_FEATURES }) => (
  <div className="login-feature-stack">
    {features.map((item, idx) => (
      <div key={idx} className="login-feature-card">
        <div className="login-feature-icon">{item.icon}</div>
        <Box>
          <Typography variant="subtitle2" className="login-feature-title">{item.title}</Typography>
          <Typography variant="body2" className="login-feature-desc">{item.desc}</Typography>
        </Box>
      </div>
    ))}
  </div>
);

export default FeatureStack;