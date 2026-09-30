import { Skeleton } from '@mui/material';
import { Inventory2Outlined, CheckCircleOutline, PauseCircleOutline, DesignServicesOutlined } from '@mui/icons-material';

const cards = [['total', 'Total Products', Inventory2Outlined], ['active', 'Active Products', CheckCircleOutline], ['inactive', 'Inactive Products', PauseCircleOutline], ['services', 'Services', DesignServicesOutlined]];

export function ProductSummaryCards({ summary, selected, onSelect }) {
  return <section className="product-summary" aria-label="Catalog summary">{cards.map(([key, label, Icon]) => <button type="button" className={`product-summary-card tone-${key}${selected === key ? ' selected' : ''}`} key={key} onClick={() => onSelect(key)} aria-label={`${label}: ${summary?.[key] ?? 'loading'}`} aria-pressed={selected === key}><div className="product-summary-top"><span className="product-summary-label">{label}</span><span className="product-summary-icon" aria-hidden="true"><Icon /></span></div><strong>{summary ? summary[key] : <Skeleton width={45} />}</strong><small>{{ total: 'Across your catalog', active: 'Available for billing', inactive: 'Not available for billing', services: 'Expertise & subscriptions' }[key]}</small></button>)}</section>;
}
