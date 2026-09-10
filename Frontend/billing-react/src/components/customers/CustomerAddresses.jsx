import { Card } from '@mui/material';
import { InformationCard } from './CustomerShared';

export function CustomerAddresses({ customer }) {
  return <div className="customer-card-grid">{[['Billing Address', customer.billingAddress], ['Shipping Address', customer.shippingAddress]].map(([title, address]) => address ? <InformationCard key={title} title={title} fields={[[ 'Address Line 1', address.line1 ], [ 'Address Line 2', address.line2 ], [ 'City', address.city ], [ 'State', address.state ], [ 'Postal Code', address.postalCode ], [ 'Country', address.country ]]} /> : <Card key={title} className="customer-card"><h2>{title}</h2><p className="customer-empty">No {title.toLowerCase()} available.</p></Card>)}</div>;
}
