import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Grid,
  Box,
  Chip,
} from '@mui/material';
import {
  ArrowForward,
  CheckCircle,
  CreditCard,
  AccountBalance,
  QrCode2,
  Payments,
  WhatsApp,
  Email,
  Smartphone,
  Check,
  AccountBalanceWallet,
} from '@mui/icons-material';
import { useAuthNav } from 'billing-react';
import { InvoiceBillingLogo } from '../../components/InvoiceBillingLogo';
import { HeroMockup } from './HeroMockup';
import { TaxInvoiceSheet } from './TaxInvoiceSheet';
import {
  INVOICE_TEMPLATES,
  CAPABILITIES,
  PAYMENT_MODES,
  SHARE_ITEMS,
  RECON_LEDGER_ITEMS,
  STATS_METRICS,
} from './landingData';
import '../../styles/Landing.css';

const PAYMENT_ICONS = {
  card: <CreditCard sx={{ fontSize: 20 }} />,
  upi: <QrCode2 sx={{ fontSize: 20 }} />,
  netbanking: <AccountBalance sx={{ fontSize: 20 }} />,
  cash: <Payments sx={{ fontSize: 20 }} />,
};

const CHANNEL_ICONS = {
  whatsapp: <WhatsApp sx={{ fontSize: 24, color: '#25d366' }} />,
  email: <Email sx={{ fontSize: 24, color: '#ec4899' }} />,
  sms: <Smartphone sx={{ fontSize: 24, color: '#8b5cf6' }} />,
};

export const Landing = () => {
  const { handleNav, isExiting } = useAuthNav();
  const [selectedPayment, setSelectedPayment] = useState('upi');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showNavbar, setShowNavbar] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 40);
      if (currentScrollY <= 60) {
        setShowNavbar(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 120) {
        setShowNavbar(false);
      } else if (currentScrollY < lastScrollY) {
        setShowNavbar(true);
      }
      lastScrollY = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSignIn = () => handleNav('/login');

  return (
    <Box className={`landing-root ${isExiting ? 'page-exit-active' : 'page-enter-active'}`}>
      {/* Dynamic Fintech Ambient Background */}
      <div className="landing-bg-container" aria-hidden="true">
        <div className="landing-bg-grid" />
        <div className="landing-bg-orb orb-primary" />
        <div className="landing-bg-orb orb-cyan" />
        <div className="landing-bg-orb orb-amber" />
        <div className="landing-bg-orb orb-purple" />
        <svg className="landing-bg-waves" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
          <path d="M-100,160 C320,40 760,380 1540,120" stroke="rgba(154, 79, 47, 0.20)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M-100,280 C420,120 860,480 1540,240" stroke="rgba(223, 162, 75, 0.15)" strokeWidth="2" strokeLinecap="round" />
          <path d="M-100,420 C360,260 820,620 1540,360" stroke="rgba(154, 79, 47, 0.14)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="320" cy="160" r="4" fill="rgba(154, 79, 47, 0.35)" />
          <circle cx="780" cy="390" r="3.5" fill="rgba(223, 162, 75, 0.3)" />
          <circle cx="1180" cy="220" r="4" fill="rgba(154, 79, 47, 0.35)" />
        </svg>
      </div>

      {/* 1. Show-On-Scroll Smart Navbar */}
      <AppBar
        position="fixed"
        elevation={0}
        className={`swipe-navbar ${showNavbar ? 'navbar-visible' : 'navbar-hidden'} ${isScrolled ? 'navbar-scrolled' : 'navbar-top'}`}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters className="swipe-toolbar">
            <Box className="swipe-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <InvoiceBillingLogo />
              <Box>
                <Typography variant="h6" className="swipe-brand-title">
                  INVOICE<span className="brand-dot">.</span>BILLING
                </Typography>
                <Typography variant="caption" className="swipe-brand-caption">
                  GST INVOICING &amp; PAYMENTS
                </Typography>
              </Box>
            </Box>

            <Box className="navbar-center-links">
              <span className="nav-link" onClick={() => document.getElementById('templates')?.scrollIntoView({ behavior: 'smooth' })}>Invoices</span>
              <span className="nav-link" onClick={() => document.getElementById('payments')?.scrollIntoView({ behavior: 'smooth' })}>Payments</span>
              <span className="nav-link" onClick={() => document.getElementById('share')?.scrollIntoView({ behavior: 'smooth' })}>WhatsApp</span>
              <span className="nav-link" onClick={() => document.getElementById('inventory')?.scrollIntoView({ behavior: 'smooth' })}>Reconciliation</span>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <div className="secure-badge-pill">
                <span className="secure-dot" />
                <span>100% Safe &amp; GST Ready</span>
              </div>
              <Button variant="contained" onClick={handleSignIn} endIcon={<ArrowForward sx={{ fontSize: 16 }} />} className="nav-signup-btn">
                Sign in
              </Button>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      {/* 2. Hero Section */}
      <Box component="section" className="swipe-hero-section">
        <Container maxWidth="lg">
          <Grid container spacing={5} alignItems="center">
            <Grid item xs={12} md={6.5}>
              <div className="hero-safe-pill">
                <span className="pill-dot">🛡️</span>
                <span>100% Safe, Secure &amp; GST Compliant!</span>
              </div>

              <Typography variant="h1" className="swipe-hero-title">
                Simple Invoicing.<br />
                <span className="hero-accent-text">Easy Payments.</span>
              </Typography>

              <Typography variant="body1" className="swipe-hero-desc">
                Create <strong>GST invoices in 10 seconds ⚡</strong>. Customize professional templates, share bills instantly on WhatsApp, and collect payments with automated bank reconciliation.
              </Typography>

              <Box className="hero-cta-row">
                <Button
                  variant="contained"
                  size="large"
                  href="#payments"
                  endIcon={<ArrowForward />}
                  className="hero-main-btn"
                >
                  Explore Payments
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  href="#templates"
                  className="hero-secondary-btn"
                >
                  View Sample Invoices &rarr;
                </Button>
              </Box>

              <div className="hero-trust-bar">
                <span className="trust-heart">💛</span>
                <span className="trust-text">Trusted by <strong>50,000+ Fast-Growing Businesses</strong> across India</span>
              </div>
            </Grid>

            {/* Right: Hero Interactive Visual Mockup */}
            <Grid item xs={12} md={5.5}>
              <HeroMockup />
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* 3. Moving Platform Capabilities Flashcards Ribbon */}
      <Box component="section" className="capabilities-ribbon-section">
        <div className="capabilities-ribbon-label">
          <Typography variant="overline" className="ribbon-text">
            ⚡ EVERYTHING YOUR BILLING &amp; REVENUE OPERATIONS NEED &bull; BUILT FOR SCALE
          </Typography>
        </div>
        <div className="capabilities-marquee-wrapper">
          <div className="capabilities-marquee-track">
            {CAPABILITIES.concat(CAPABILITIES).map((c, idx) => (
              <div key={idx} className="capability-pill-card">
                <span className="pill-icon">{c.icon}</span>
                <div className="pill-content">
                  <div className="pill-top">
                    <span className="pill-title">{c.title}</span>
                    <span className="pill-badge">{c.tag}</span>
                  </div>
                  <span className="pill-desc">{c.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Box>

      {/* 4. Real Tax Invoice Templates Showcase (Directly from Swipe Image 2) */}
      <Box component="section" id="templates" className="templates-showcase-section">
        <Container maxWidth="lg">
          <div className="section-title-wrap">
            <span className="section-pill-tag">TAX INVOICE TEMPLATES</span>
            <Typography variant="h2" className="section-main-heading">
              Professional GST Invoices for Every Business
            </Typography>
            <Typography variant="body1" className="section-main-sub">
              Pre-configured, government-compliant invoice designs formatted for GST, dynamic UPI QR codes, HSN breakdowns, and digital signatures. Select a company to view its invoice.
            </Typography>
          </div>

          {/* Template Selector Tabs */}
          <div className="template-tabs-row">
            {INVOICE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={selectedTemplate === t.id}
                aria-controls="invoice-preview"
                className={`template-tab-btn ${selectedTemplate === t.id ? 'active' : ''}`}
                onClick={() => setSelectedTemplate(t.id)}
              >
                <span className="tab-bullet" />
                <span>{t.company}</span>
              </button>
            ))}
          </div>
        </Container>

        {/* Continuous Moving Invoices Marquee Track */}
        {selectedTemplate ? (
          <Container maxWidth="sm" id="invoice-preview" className="selected-invoice-preview" aria-live="polite">
            <TaxInvoiceSheet inv={INVOICE_TEMPLATES.find((inv) => inv.id === selectedTemplate)} isSelected />
            <Button onClick={() => setSelectedTemplate(null)} className="hero-secondary-btn">
              Show all invoices
            </Button>
          </Container>
        ) : (
        <div id="invoice-preview" className="invoices-marquee-container">
          <div className="invoices-marquee-track">
            {INVOICE_TEMPLATES.concat(INVOICE_TEMPLATES).map((inv, idx) => (
              <div key={`${inv.id}-${idx}`} className="invoice-carousel-item">
                <TaxInvoiceSheet
                  inv={inv}
                  isSelected={selectedTemplate === inv.id}
                  onSelect={(id) => setSelectedTemplate(id)}
                />
              </div>
            ))}
          </div>
        </div>
        )}
      </Box>

      {/* 5. Feature Block: Record Payments Effortlessly (Inspired by Swipe Image 4) */}
      <Box component="section" id="payments" className="feature-interactive-section">
        <Container maxWidth="lg">
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={6}>
              <span className="feature-pill-badge">PAYMENT COLLECTION</span>
              <Typography variant="h2" className="feature-section-heading">
                Record payments effortlessly.
              </Typography>
              <Typography variant="body1" className="feature-section-desc">
                Track every payment, every time — without lifting a finger. While others make it complicated, we make it simple. Provide your customers with instant UPI QR codes, card payments, netbanking, or direct bank transfer options.
              </Typography>

              <div className="feature-points-list">
                <div className="point-item">
                  <CheckCircle sx={{ color: '#10b981', fontSize: 20 }} />
                  <span>Sub-second reconciliation with 99.99% ledger accuracy</span>
                </div>
                <div className="point-item">
                  <CheckCircle sx={{ color: '#10b981', fontSize: 20 }} />
                  <span>Instant UPI Dynamic QR code printed on every bill</span>
                </div>
                <div className="point-item">
                  <CheckCircle sx={{ color: '#10b981', fontSize: 20 }} />
                  <span>Automatic payment receipt sent immediately upon settlement</span>
                </div>
              </div>

            </Grid>

            <Grid item xs={12} md={6}>
              {/* Interactive Payment UI Card */}
              <div className="interactive-payment-card">
                <div className="payment-card-header">
                  <div className="inv-badge-group">
                    <span className="inv-label">Invoice #8942</span>
                    <span className="inv-verified-pill">
                      <CheckCircle sx={{ fontSize: 14, color: '#10b981' }} />
                      <span>Ready to Collect</span>
                    </span>
                  </div>
                  <span className="payment-amount-display">₹1,24,500.00</span>
                </div>

                <div className="payment-methods-selector">
                  {PAYMENT_MODES.map((mode) => (
                    <div
                      key={mode.id}
                      className={`payment-option-pill ${selectedPayment === mode.id ? 'selected' : ''}`}
                      onClick={() => setSelectedPayment(mode.id)}
                    >
                      <div className={`option-icon-box ${mode.color}`}>{PAYMENT_ICONS[mode.id]}</div>
                      <span className="option-name">{mode.name}</span>
                      {selectedPayment === mode.id && <Check className="selected-check" />}
                    </div>
                  ))}
                </div>

                <div className="payment-status-footer">
                  <span className="status-live-dot" />
                  <span>Auto-Reconciliation Active: Matched directly with HDFC &amp; ICICI bank feeds</span>
                </div>
              </div>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* 6. Feature Block: Share Anywhere via WhatsApp (Inspired by Swipe Image 5) */}
      <Box component="section" id="share" className="feature-interactive-section alt-bg">
        <Container maxWidth="lg">
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={6}>
              {/* Interactive Multi-Channel Sharing Preview Card */}
              <div className="interactive-share-card">
                {SHARE_ITEMS.map((item) => (
                  <div key={item.id} className={`share-channel-row ${item.id}-channel`}>
                    <div className={`channel-icon-pill ${item.color}`}>
                      {CHANNEL_ICONS[item.id]}
                    </div>
                    <div className="channel-meta">
                      <span className="channel-title">{item.name}</span>
                      <span className="channel-sub">{item.sub}</span>
                    </div>
                    <Chip label={item.chip} size="small" className={`channel-status-chip ${item.color}`} />
                  </div>
                ))}
              </div>
            </Grid>

            <Grid item xs={12} md={6}>
              <span className="feature-pill-badge">MULTI-CHANNEL DISTRIBUTION</span>
              <Typography variant="h2" className="feature-section-heading">
                Share anywhere.<br />Get paid faster.
              </Typography>
              <Typography variant="body1" className="feature-section-desc">
                Send invoices instantly via WhatsApp, email, or SMS. And with smart automated reminders, you don't have to chase anyone. Clients can open the invoice on their phone and pay immediately via UPI.
              </Typography>

              <div className="feature-points-list">
                <div className="point-item">
                  <CheckCircle sx={{ color: '#10b981', fontSize: 20 }} />
                  <span>WhatsApp Business API delivery with branded invoice cards</span>
                </div>
                <div className="point-item">
                  <CheckCircle sx={{ color: '#10b981', fontSize: 20 }} />
                  <span>Automated payment reminders reduce overdue bills by 40%</span>
                </div>
                <div className="point-item">
                  <CheckCircle sx={{ color: '#10b981', fontSize: 20 }} />
                  <span>Track when the recipient opens, downloads, or pays the invoice</span>
                </div>
              </div>

            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* 7. Feature Block: Real-Time Ledger & Inventory (Inspired by Swipe Image 3) */}
      <Box component="section" id="inventory" className="feature-interactive-section">
        <Container maxWidth="lg">
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={6}>
              <span className="feature-pill-badge">LEDGER &amp; RECONCILIATION</span>
              <Typography variant="h2" className="feature-section-heading">
                Reconciliation so simple,<br />it feels like magic.
              </Typography>
              <Typography variant="body1" className="feature-section-desc">
                Automated two-way ledger reconciliation matches bank credits with outstanding invoices in real-time. Know exactly who has paid, who owes you money, and generate GST reports in one click.
              </Typography>

              <div className="feature-points-list">
                <div className="point-item">
                  <CheckCircle sx={{ color: '#10b981', fontSize: 20 }} />
                  <span>Sub-second matching of bank credits directly to unpaid invoices</span>
                </div>
                <div className="point-item">
                  <CheckCircle sx={{ color: '#10b981', fontSize: 20 }} />
                  <span>One-click export of GSTR-1, GSTR-3B, and financial audit files</span>
                </div>
                <div className="point-item">
                  <CheckCircle sx={{ color: '#10b981', fontSize: 20 }} />
                  <span>Eliminate revenue leakage and manual bank statement cross-checking</span>
                </div>
              </div>

            </Grid>

            <Grid item xs={12} md={6}>
              {/* Interactive Bank Reconciliation & Invoice Settlement Ledger */}
              <div className="interactive-reconciliation-card">
                <div className="reconciliation-card-top">
                  <div className="reconciliation-badge">
                    <AccountBalanceWallet sx={{ fontSize: 20, color: '#9A4F2F' }} />
                    <span>Invoice Settlement Ledger</span>
                  </div>
                  <span className="reconciliation-status-pill">Live 2-Way Sync</span>
                </div>

                <div className="reconciliation-table">
                  <div className="reconciliation-table-header">
                    <span>Invoice #</span>
                    <span>Client / Payer</span>
                    <span>Status</span>
                    <span style={{ textAlign: 'right' }}>Amount</span>
                  </div>
                  {RECON_LEDGER_ITEMS.map((item, idx) => (
                    <div className="reconciliation-row" key={idx}>
                      <span className="rec-inv-id mono">{item.id}</span>
                      <span className="rec-client">{item.client}</span>
                      <span className={`rec-status-chip ${item.type}`}>{item.status}</span>
                      <span className="rec-amount mono">{item.amount}</span>
                    </div>
                  ))}
                </div>

                <div className="reconciliation-action-btns">
                  <div className="rec-btn match">Auto-Match Bank Feeds ✓</div>
                  <div className="rec-btn export">Export GSTR-1 Summary &rarr;</div>
                </div>
              </div>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* 8. Stats Strip */}
      <Box component="section" className="swipe-stats-strip">
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            {STATS_METRICS.map((stat, idx) => (
              <Grid item xs={6} md={3} key={idx}>
                <Typography variant="h3" className="stat-big-number">{stat.val}</Typography>
                <Typography variant="body2" className="stat-sub-label">{stat.label}</Typography>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* 9. High-Converting Final CTA Banner */}
      <Box component="section" className="swipe-cta-banner">
        <Container maxWidth="md">
          <div className="swipe-cta-card">
            <div className="cta-top-spark">
              <span className="spark-emoji">🚀</span>
              <span>GET STARTED IN MINUTES</span>
            </div>
            <Typography variant="h2" className="cta-bold-title">
              Ready to Simplify Your Invoicing &amp; Payments?
            </Typography>
            <Typography variant="body1" className="cta-bold-sub">
              Create professional GST invoices, share bills directly on WhatsApp, and collect payments with automated bank reconciliation today.
            </Typography>
            <div className="cta-footer-trust">
              <span>✓ 100% Free Trial</span>
              <span>&bull;</span>
              <span>🛡️ 256-Bit Bank-Grade Security</span>
              <span>&bull;</span>
              <span>🏛️ GST Portal Verified</span>
            </div>
          </div>
        </Container>
      </Box>

      {/* 10. Modern Clean Footer */}
      <Box component="footer" className="swipe-footer">
        <Container maxWidth="lg">
          <div className="footer-top-row">
            <Box className="footer-brand">
              <InvoiceBillingLogo size={18} />
              <span className="footer-brand-name">invoice.billing</span>
            </Box>
            <div className="footer-nav-links">
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
              <span>GST Guide</span>
              <span>API Documentation</span>
              <span>Contact Support</span>
            </div>
          </div>
          <div className="footer-divider" />
          <div className="footer-bottom-row">
            <Typography variant="body2" className="footer-copyright">
              &copy; 2026 invoice.billing Platform. Protected by TLS 1.3 &amp; ISO 27001 Security.
            </Typography>
            <span className="footer-badge">Made for Fast-Growing Indian Businesses 🇮🇳</span>
          </div>
        </Container>
      </Box>
    </Box>
  );
};

export default Landing;
