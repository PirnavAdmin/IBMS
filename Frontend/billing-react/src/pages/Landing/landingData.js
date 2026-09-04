export const CAPABILITIES = [
  { icon: '⚡', title: 'Automated GST e-Invoicing', desc: 'One-click IRN & QR generation with instant government tax portal sync', tag: 'GOVT. NIC READY' },
  { icon: '🔄', title: 'Subscription & Recurring Billing', desc: 'Automate weekly, monthly cycles with prorated upgrades', tag: 'MULTI-CYCLE ENGINE' },
  { icon: '🏦', title: 'Real-Time Bank Reconciliation', desc: 'Sub-second two-way bank feed matching with 99.99% accuracy', tag: 'SUB-SECOND MATCH' },
  { icon: '💬', title: 'Instant WhatsApp Invoicing', desc: 'Deliver invoices and payment links directly on WhatsApp', tag: 'CLICK-TO-PAY' },
  { icon: '📜', title: 'Instant PDF & Digital Signing', desc: 'Pixel-perfect downloadable PDFs with cryptographic signatures', tag: 'TAMPER-PROOF' },
  { icon: '💳', title: 'Multi-Gateway Payment Links', desc: 'Collect payments via UPI, Cards, NetBanking with auto-receipts', tag: 'INSTANT CAPTURE' },
  { icon: '📊', title: 'GSTR-1 & Financial Reports', desc: 'One-click export of GST summaries and ledger statements', tag: 'GSTR-1 & 3B' },
  { icon: '🔔', title: 'Smart Overdue Collections', desc: 'Automated payment nudges via WhatsApp & SMS before due dates', tag: 'REDUCE DSO 40%' },
];

export const INVOICE_TEMPLATES = [
  {
    id: 'tata',
    company: 'TATA MOTORS LIMITED',
    tagline: 'Automotive & Commercial Fleet Format',
    format: 'GST Tax Invoice Standard',
    logoType: 'tata',
    logoText: 'TATA',
    badge: 'IRN Ready',
    features: ['HSN Tax Grid', 'Dynamic UPI QR', 'IRN & e-Way Ready', 'Digital Seal'],
  },
  {
    id: 'amazon',
    company: 'Amazon India',
    tagline: 'B2B Retail & Consumer Marketplace Format',
    format: 'Multi-Rate GST Standard',
    logoType: 'amazon',
    logoText: 'amazon',
    badge: 'Automated SAC',
    features: ['E-Commerce SAC', 'Instant Checkout QR', 'GST Audit Trail', 'Digital Seal'],
  },
  {
    id: 'lti',
    company: 'LTIMindtree Cloud',
    tagline: 'Enterprise Cloud & IT Consulting Format',
    format: 'Export & Domestic Tax Invoice',
    logoType: 'lti',
    logoText: 'LTIMindtree',
    badge: 'TDS Compliant',
    features: ['Service Accounting SAC', 'Dual-Currency Support', 'TDS & TCS Compliant', 'Digital Seal'],
  },
  {
    id: 'jio',
    company: 'Reliance Jio Infocomm',
    tagline: '5G Telecom & Dark Fiber Infrastructure Format',
    format: 'Telecom Recurring Billing Standard',
    logoType: 'jio',
    logoText: 'Jio',
    badge: 'Recurring e-Bill',
    features: ['Circle GST Split', 'Auto-Debit Direct UPI', 'Bulk Invoicing API', 'Digital Seal'],
  },
  {
    id: 'zomato',
    company: 'Zomato Media',
    tagline: 'Restaurant Franchises & Cloud Kitchens Format',
    format: 'Food & Logistics GST Standard',
    logoType: 'zomato',
    logoText: 'zomato',
    badge: 'Multi-Slab GST',
    features: ['5% & 18% Mixed Slabs', 'Merchant QR Settlement', 'GSTR-1 Auto-Sync', 'Digital Seal'],
  },
  {
    id: 'infosys',
    company: 'Infosys Technologies',
    tagline: 'Global Enterprise AI & Software Systems Format',
    format: 'Corporate Services Tax Invoice',
    logoType: 'infosys',
    logoText: 'Infosys',
    badge: 'SEZ / Domestic',
    features: ['SEZ / Domestic Slabs', 'Cryptographic IRN', 'Multi-GSTIN Filing', 'Digital Seal'],
  },
];

export const PAYMENT_MODES = [
  { id: 'upi', name: 'UPI Dynamic QR (Instant)', color: 'emerald' },
  { id: 'card', name: 'Credit / Debit Cards (Visa, MC)', color: 'blue' },
  { id: 'netbanking', name: 'NetBanking (50+ Banks)', color: 'indigo' },
  { id: 'cash', name: 'Direct Bank Settlement (NEFT/RTGS)', color: 'amber' },
];

export const SHARE_ITEMS = [
  { id: 'whatsapp', name: 'WhatsApp Business API', sub: 'Interactive click-to-pay message with PDF attached', chip: 'Delivered in 1.2s', color: 'green' },
  { id: 'email', name: 'Branded HTML Email', sub: 'Secure portal link + embedded invoice summary', chip: 'Open Rate: 84%', color: 'pink' },
  { id: 'sms', name: 'SMS Payment Link', sub: 'Short link with auto OTP authentication', chip: '99.4% Delivery', color: 'purple' },
];

export const STATS_METRICS = [
  { val: '₹500 Cr+', label: 'Invoices Generated' },
  { val: '99.99%', label: 'Reconciliation Accuracy' },
  { val: '< 10s', label: 'Average Invoice Creation' },
  { val: '100%', label: 'GST Compliance Verified' },
];

export const RECON_LEDGER_ITEMS = [
  { id: '#INV-0042', client: 'Tata Motors Ltd', status: 'Matched ✓', type: 'matched', amount: '₹9,52,399' },
  { id: '#AMZ-8921', client: 'Amazon India', status: 'Auto-Settled ✓', type: 'settled', amount: '₹19,498' },
  { id: '#LTI-1102', client: 'LTIMindtree Cloud', status: 'Reconciled ✓', type: 'matched', amount: '₹7,25,390' },
  { id: '#INF-3391', client: 'Infosys Tech', status: 'UPI Paid ✓', type: 'upi', amount: '₹3,40,000' },
];
