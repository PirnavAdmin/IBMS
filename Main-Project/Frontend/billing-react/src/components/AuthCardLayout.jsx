import React from 'react';
import { Box, Button, Container, Grid, Typography } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { BackgroundLayers } from './BackgroundLayers.jsx';
import { HoverboardCard } from './HoverboardCard.jsx';
import { WindowDots } from './WindowDots.jsx';
import { BrandHeader } from './BrandHeader.jsx';

export const AuthCardLayout = ({
  children,
  isExiting = false,
  maxWidth = 'sm',
  heroSide = null,
  backLabel = 'Back to Sign In',
  tagLabel = 'AUTH',
  version = 'v2.6',
  brandTitle = 'INVOICE.BILLING',
  brandSubtitle = 'PORTAL ACCESS',
  brandIcon,
  cardDescription = null,
  alerts = null,
  onBack,
}) => (
  <Box className={`login-root ${isExiting ? 'page-exit-active' : 'page-enter-active'}`}>
    <BackgroundLayers />
    <Box className="login-page-wrapper">
      <Container maxWidth={maxWidth}>
        {heroSide ? (
          <Grid container spacing={{ xs: 3, md: 4, lg: 6 }} alignItems="center">
            <Grid item xs={12} md={6} lg={6.5} className="login-content-side">
              {heroSide}
            </Grid>
            <Grid item xs={12} md={6} lg={5.5} className="login-form-side">
              <div className="login-showcase-container">
                <HoverboardCard>
                  <div className="glass-card-header">
                    <Button onClick={onBack} startIcon={<ArrowBack sx={{ fontSize: 15 }} />} className="auth-back-btn">
                      {backLabel}
                    </Button>
                    <WindowDots label={tagLabel} version={version} />
                  </div>
                  <BrandHeader title={brandTitle} subtitle={brandSubtitle} icon={brandIcon} />
                  {cardDescription && (
                    <Typography variant="body2" className="card-mode-desc">
                      {cardDescription}
                    </Typography>
                  )}
                  {alerts}
                  {children}
                  <Box className="auth-footer-notice">
                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.3, fontSize: '0.7rem' }}>
                      Protected with 256-bit secure encryption
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.68rem' }}>
                      Invoicing &amp; Billing Platform &bull; All Rights Reserved
                    </Typography>
                  </Box>
                </HoverboardCard>
              </div>
            </Grid>
          </Grid>
        ) : (
          <HoverboardCard>
            <div className="glass-card-header">
              <Button onClick={onBack} startIcon={<ArrowBack sx={{ fontSize: 15 }} />} className="auth-back-btn">
                {backLabel}
              </Button>
              <WindowDots label={tagLabel} version={version} />
            </div>
            <BrandHeader title={brandTitle} subtitle={brandSubtitle} icon={brandIcon} />
            {cardDescription && (
              <Typography variant="body2" className="card-mode-desc">
                {cardDescription}
              </Typography>
            )}
            {alerts}
            {children}
            <Box className="auth-footer-notice">
              <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.3, fontSize: '0.7rem' }}>
                Protected with 256-bit secure encryption
              </Typography>
              <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.68rem' }}>
                Invoicing &amp; Billing Platform &bull; All Rights Reserved
              </Typography>
            </Box>
          </HoverboardCard>
        )}
      </Container>
    </Box>
  </Box>
);

export default AuthCardLayout;