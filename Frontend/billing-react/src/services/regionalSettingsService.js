import { useState, useEffect } from 'react';
import { authApi, apiClient } from 'billing-api-client';

export const COUNTRIES_LIST = [
  { name: 'India', code: 'IN', phoneCode: '+91', currency: 'INR', currencySymbol: '₹', flag: '🇮🇳' },
  { name: 'United States', code: 'US', phoneCode: '+1', currency: 'USD', currencySymbol: '$', flag: '🇺🇸' },
  { name: 'United Kingdom', code: 'GB', phoneCode: '+44', currency: 'GBP', currencySymbol: '£', flag: '🇬🇧' },
  { name: 'Australia', code: 'AU', phoneCode: '+61', currency: 'AUD', currencySymbol: 'A$', flag: '🇦🇺' },
  { name: 'Singapore', code: 'SG', phoneCode: '+65', currency: 'SGD', currencySymbol: 'S$', flag: '🇸🇬' },
  { name: 'United Arab Emirates', code: 'AE', phoneCode: '+971', currency: 'AED', currencySymbol: 'AED', flag: '🇦🇪' },
  { name: 'Canada', code: 'CA', phoneCode: '+1', currency: 'CAD', currencySymbol: 'CA$', flag: '🇨🇦' },
  { name: 'Germany', code: 'DE', phoneCode: '+49', currency: 'EUR', currencySymbol: '€', flag: '🇩🇪' },
  { name: 'France', code: 'FR', phoneCode: '+33', currency: 'EUR', currencySymbol: '€', flag: '🇫🇷' },
  { name: 'Japan', code: 'JP', phoneCode: '+81', currency: 'JPY', currencySymbol: '¥', flag: '🇯🇵' },
  { name: 'Saudi Arabia', code: 'SA', phoneCode: '+966', currency: 'SAR', currencySymbol: 'SAR', flag: '🇸🇦' },
  { name: 'New Zealand', code: 'NZ', phoneCode: '+64', currency: 'NZD', currencySymbol: 'NZ$', flag: '🇳🇿' },
  { name: 'South Africa', code: 'ZA', phoneCode: '+27', currency: 'ZAR', currencySymbol: 'R', flag: '🇿🇦' },
  { name: 'Ireland', code: 'IE', phoneCode: '+353', currency: 'EUR', currencySymbol: '€', flag: '🇮🇪' },
  { name: 'Italy', code: 'IT', phoneCode: '+39', currency: 'EUR', currencySymbol: '€', flag: '🇮🇹' },
  { name: 'Spain', code: 'ES', phoneCode: '+34', currency: 'EUR', currencySymbol: '€', flag: '🇪🇸' },
  { name: 'Netherlands', code: 'NL', phoneCode: '+31', currency: 'EUR', currencySymbol: '€', flag: '🇳🇱' },
  { name: 'Switzerland', code: 'CH', phoneCode: '+41', currency: 'CHF', currencySymbol: 'CHF', flag: '🇨🇭' },
  { name: 'Sweden', code: 'SE', phoneCode: '+46', currency: 'SEK', currencySymbol: 'kr', flag: '🇸🇪' },
  { name: 'Norway', code: 'NO', phoneCode: '+47', currency: 'NOK', currencySymbol: 'kr', flag: '🇳🇴' },
  { name: 'Denmark', code: 'DK', phoneCode: '+45', currency: 'DKK', currencySymbol: 'kr', flag: '🇩🇰' },
  { name: 'Malaysia', code: 'MY', phoneCode: '+60', currency: 'MYR', currencySymbol: 'RM', flag: '🇲🇾' },
  { name: 'Indonesia', code: 'ID', phoneCode: '+62', currency: 'IDR', currencySymbol: 'Rp', flag: '🇮🇩' },
  { name: 'Philippines', code: 'PH', phoneCode: '+63', currency: 'PHP', currencySymbol: '₱', flag: '🇵🇭' },
  { name: 'Thailand', code: 'TH', phoneCode: '+66', currency: 'THB', currencySymbol: '฿', flag: '🇹🇭' },
  { name: 'Brazil', code: 'BR', phoneCode: '+55', currency: 'BRL', currencySymbol: 'R$', flag: '🇧🇷' },
  { name: 'Mexico', code: 'MX', phoneCode: '+52', currency: 'MXN', currencySymbol: 'Mex$', flag: '🇲🇽' },
  { name: 'Qatar', code: 'QA', phoneCode: '+974', currency: 'QAR', currencySymbol: 'QR', flag: '🇶🇦' },
  { name: 'Kuwait', code: 'KW', phoneCode: '+965', currency: 'KWD', currencySymbol: 'KD', flag: '🇰🇼' },
  { name: 'China', code: 'CN', phoneCode: '+86', currency: 'CNY', currencySymbol: '¥', flag: '🇨🇳' },
  { name: 'South Korea', code: 'KR', phoneCode: '+82', currency: 'KRW', currencySymbol: '₩', flag: '🇰🇷' },
];

export function findCountry(countryOrCode) {
  if (!countryOrCode) return null;
  const str = String(countryOrCode).trim().toLowerCase();
  return (
    COUNTRIES_LIST.find(
      (c) => c.name.toLowerCase() === str || c.code.toLowerCase() === str
    ) || null
  );
}

export function findCountryByCallingCode(phoneCode, preferredCountryCode = null) {
  if (!phoneCode) return null;
  const str = String(phoneCode).trim();
  const normalized = str.startsWith('+') ? str : `+${str}`;

  // If a preferred country code is provided (e.g. from Settings), check it first
  if (preferredCountryCode) {
    const pref = COUNTRIES_LIST.find(
      (c) =>
        (c.code.toLowerCase() === String(preferredCountryCode).toLowerCase() ||
         c.name.toLowerCase() === String(preferredCountryCode).toLowerCase()) &&
        c.phoneCode === normalized
    );
    if (pref) return pref;
  }

  return COUNTRIES_LIST.find((c) => c.phoneCode === normalized) || null;
}

export function getDefaultCountryFromSettings() {
  const selected = regionalSettingsService.getSelectedCountries();
  if (Array.isArray(selected) && selected.length > 0) {
    return selected[0];
  }
  return null;
}

const REGIONAL_SETTINGS_EVENT = 'invoice_billing_regional_settings_changed';

function getStorageScope() {
  try {
    const user = authApi.getCurrentUser();
    if (user?.tenantId) return `tenant_${user.tenantId}`;
    if (user?.id) return `user_${user.id}`;
    if (user?.email) return `email_${user.email}`;
  } catch (e) {
    // fallback
  }
  return 'default';
}

function getStorageKey() {
  return `invoice_billing_selected_countries_${getStorageScope()}`;
}

export const regionalSettingsService = {
  getSelectedCountries() {
    try {
      const raw = localStorage.getItem(getStorageKey()) || localStorage.getItem('invoice_billing_selected_countries_default');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => (typeof item === 'object' ? findCountry(item?.name || item?.code) : findCountry(item)))
            .filter(Boolean);
        }
      }
    } catch (e) {
      // storage unavailable or invalid json
    }
    // No default country
    return [];
  },

  async saveSelectedCountries(countries) {
    const list = Array.isArray(countries) ? countries : (countries ? [countries] : []);
    const normalized = list
      .map((item) => (typeof item === 'object' ? findCountry(item?.name || item?.code) : findCountry(item)))
      .filter(Boolean);

    // Filter unique by country code
    const unique = [];
    const seen = new Set();
    for (const c of normalized) {
      if (!seen.has(c.code)) {
        seen.add(c.code);
        unique.push(c);
      }
    }

    const key = getStorageKey();
    try {
      const serialized = JSON.stringify(unique.map((c) => c.name));
      localStorage.setItem(key, serialized);
      localStorage.setItem('invoice_billing_selected_countries_default', serialized);
    } catch (e) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(REGIONAL_SETTINGS_EVENT, { detail: unique })
      );
    }

    let backendStatus = {
      backendBlocked: true,
      message: `${unique.length} ${unique.length === 1 ? 'country' : 'countries'} saved for application. Note: Backend API /api/v1/settings/country is pending server implementation (BACKEND BLOCKED).`,
    };

    try {
      const response = await apiClient.put('/api/v1/settings/country', {
        countries: unique.map((c) => ({
          country: c.name,
          countryCode: c.code,
          phoneCode: c.phoneCode,
          currency: c.currency,
        })),
      });
      if (response && response.status >= 200 && response.status < 300) {
        backendStatus = { backendBlocked: false, message: 'Country settings saved successfully.' };
      }
    } catch (err) {
      // Mark BACKEND BLOCKED per project specifications
    }

    return {
      selectedCountries: unique,
      ...backendStatus,
    };
  },
};

export function useRegionalSettings() {
  const [selectedCountries, setSelectedCountries] = useState(() =>
    regionalSettingsService.getSelectedCountries()
  );

  useEffect(() => {
    const handleUpdate = (e) => {
      if (Array.isArray(e.detail)) {
        setSelectedCountries(e.detail);
      } else {
        setSelectedCountries(regionalSettingsService.getSelectedCountries());
      }
    };
    const handleStorage = (e) => {
      if (e.key && e.key.startsWith('invoice_billing_selected_countries')) {
        setSelectedCountries(regionalSettingsService.getSelectedCountries());
      }
    };

    window.addEventListener(REGIONAL_SETTINGS_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(REGIONAL_SETTINGS_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const selectedCurrencies = Array.from(
    new Set(selectedCountries.map((c) => c.currency))
  );

  const selectedPhoneCodes = Array.from(
    new Set(selectedCountries.map((c) => c.phoneCode))
  );

  const defaultCountry = selectedCountries.length > 0 ? selectedCountries[0] : null;
  const defaultCallingCode = defaultCountry ? defaultCountry.phoneCode : null;

  return {
    selectedCountries,
    availableCountries: COUNTRIES_LIST,
    selectedCurrencies,
    selectedPhoneCodes,
    hasSelectedCountries: selectedCountries.length > 0,
    defaultCountry,
    defaultCallingCode,
    saveCountries: regionalSettingsService.saveSelectedCountries,
  };
}

export default regionalSettingsService;
