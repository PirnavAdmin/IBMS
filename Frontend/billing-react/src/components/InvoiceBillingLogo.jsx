import React, { useId } from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import './InvoiceBillingLogo.css';

const logo = '/branding/ibms-brand.png';

export const InvoiceBillingLogo = ({ size = 24, tone = 'brand', variant = 'crest' }) => {
  const full = variant === 'full';
  const theme = useTheme();
  const onDark = tone === 'on-dark' || theme.palette.mode === 'dark';
  const clipId = 'ibms-logo-' + useId().replace(/:/g, '');
  return <Box component="span" className={`ibms-logo ibms-logo--${full ? 'full' : 'crest'}`} aria-hidden={full ? undefined : true} data-tone={tone} data-contrast={onDark ? 'light' : 'original'} sx={{
    display: full ? 'block' : 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: full ? '100%' : size + 16, height: full ? 'auto' : size + 16,
    flexShrink: 0, background: 'transparent', borderRadius: 0, boxShadow: 'none',
  }}>
    {full ? <Box component="img" src={logo} alt="IBMS — Invoice & Business Management"
      width={1448} height={1086} decoding="async" draggable={false}
      sx={{ display: 'block', width: '100%', height: 'auto', objectFit: 'contain' }} />
      : <Box component="svg" viewBox="340 40 730 680" focusable="false" aria-hidden="true"
        sx={{ display: 'block', width: '100%', height: '100%', overflow: 'hidden' }}>
        {/* Show the supplied monogram clearly at compact sizes; the source stays intact. */}
        <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect x="340" y="40" width="730" height="680" /></clipPath></defs>
        <g clipPath={`url(#${clipId})`}><image href={logo} width="1448" height="1086" /></g>
      </Box>}
  </Box>;
};
