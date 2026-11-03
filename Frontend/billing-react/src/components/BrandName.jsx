import './BrandName.css';

export const BRAND_FULL_NAME = 'INVOICE BILLING MANAGEMENT SYSTEM';

export function BrandName() {
  return <span className="ibms-brand-name">
    <strong>IBMS</strong>
    <span className="ibms-brand-full-name" title={BRAND_FULL_NAME}>{BRAND_FULL_NAME}</span>
  </span>;
}
