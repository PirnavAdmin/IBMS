import React from 'react';
import { Box, Typography } from '@mui/material';

export const WindowDots = ({ version = 'v2.6', label = 'AUTH' }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <span className="window-dot dot-red" />
    <span className="window-dot dot-yellow" />
    <span className="window-dot dot-green" />
    <Typography variant="caption" className="mono" sx={{ color: '#94a3b8', ml: 0.5, fontSize: '0.7rem' }}>
      {label} // {version}
    </Typography>
  </Box>
);

export default WindowDots;