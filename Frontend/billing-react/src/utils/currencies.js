import { CURRENCY_REFERENCE } from '../data/currencies.js';

const sharedLabels = {
  INR: 'India', USD: 'United States', GBP: 'United Kingdom', EUR: 'European Union',
  AUD: 'Australia', NZD: 'New Zealand', CHF: 'Switzerland / Liechtenstein',
  DKK: 'Denmark', NOK: 'Norway', ZAR: 'South Africa', XAF: 'Central Africa',
  XOF: 'West Africa', XCD: 'East Caribbean', XPF: 'French Pacific territories',
  XCG: 'Curaçao / Sint Maarten', AED: 'UAE',
};

const countryLabel = name => name.replace(/ \(THE\)/g, '').toLowerCase()
  .replace(/(^|[\s(])\p{L}/gu, letter => letter.toUpperCase());
const searchable = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function getCurrencySymbol(code) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find(part => part.type === 'currency')?.value || code;
  } catch { return code; }
}

const displaySymbols = { AUD: 'A$', CAD: 'CA$', SGD: 'S$', NZD: 'NZ$' };
const preferredOrder = ['INR', 'USD', 'GBP', 'AUD', 'SGD', 'AED', 'CAD', 'EUR', 'JPY', 'SAR', 'NZD', 'ZAR', 'CHF'];
const currencyRank = code => { const index = preferredOrder.indexOf(code); return index < 0 ? preferredOrder.length : index; };
export const CURRENCY_CODES = CURRENCY_REFERENCE.map(currency => currency.code);
export const CURRENCY_OPTIONS = CURRENCY_REFERENCE.map(({ code, name, countries }) => {
  const country = sharedLabels[code] || countryLabel(countries[0]);
  const symbol = displaySymbols[code] || getCurrencySymbol(code);
  return { value: code, label: `${code} (${symbol})`, searchText: searchable([country, code, name, ...countries].join(' ')) };
}).sort((a, b) => currencyRank(a.value) - currencyRank(b.value) || a.value.localeCompare(b.value, 'en'));

export function filterCurrencyOption(input, option) { return option.searchText.includes(searchable(input.trim())); }
export function getCurrencyOptions(selectedCurrency) {
  if (!selectedCurrency || CURRENCY_CODES.includes(selectedCurrency)) return CURRENCY_OPTIONS;
  return [{ value: selectedCurrency, label: `${selectedCurrency} (Saved currency)`, searchText: searchable(selectedCurrency) }, ...CURRENCY_OPTIONS];
}
