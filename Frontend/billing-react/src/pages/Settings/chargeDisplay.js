import { formatProductPrice } from '../Products/utils/formatProductPrice';
import { CURRENCY_CODES } from '../../utils/currencies';

export function formatChargeValue(charge, currency) {
  if (charge.calculationType === 'Percentage') return `${charge.value}%`;
  if (CURRENCY_CODES.includes(currency)) return formatProductPrice(charge.value, currency);
  const value = Number(charge.value);
  if (charge.value == null || !Number.isFinite(value)) return 'Unavailable';
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
