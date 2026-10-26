import { useState, useEffect } from 'react';
import { authApi, apiClient } from 'billing-api-client';

import countries195Data from '../data/countries195.json';
import { CURRENCY_CODES } from '../utils/currencies.js';

export const COUNTRIES_LIST = countries195Data;
export const BILLING_COUNTRIES_LIST = COUNTRIES_LIST.filter(country => CURRENCY_CODES.includes(country.currency));
const isBillingCountry = country => Boolean(country && CURRENCY_CODES.includes(country.currency));

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

const EMPTY_COUNTRIES = [];
const REGIONAL_SETTINGS_EVENT = 'invoice_billing_regional_settings_changed';

// Only server-confirmed selections from this authenticated session are cached.
// The deployed contract has no country-settings GET/PUT; never hydrate from legacy storage.
export const COUNTRY_SETTINGS_BLOCKER = 'Country settings API is unavailable on the current billing server (GET/PUT /api/v1/settings/country). Saved selections cannot be loaded. A save requires server confirmation.';
let confirmedSelection = null;
function getSessionScope() {
  try {
    const token = localStorage.getItem('billing_auth_token');
    const user = authApi.getCurrentUser();
    return token ? JSON.stringify([token, user?.tenantId ?? user?.tenant_id ?? null, user?.id ?? user?.email ?? null]) : null;
  } catch { return null; }
}

export const regionalSettingsService = {
  getSelectedCountries() {
    const scope = getSessionScope();
    if (!scope || confirmedSelection?.scope !== scope) {
      confirmedSelection = null;
      return [];
    }
    return [...confirmedSelection.countries];
  },

  async saveSelectedCountries(countries) {
    const scope = getSessionScope();
    const list = Array.isArray(countries) ? countries : (countries ? [countries] : []);
    const normalized = list
      .map((item) => (typeof item === 'object' ? findCountry(item?.name || item?.code) : findCountry(item)))
      .filter(isBillingCountry);

    // Filter unique by country code
    const unique = [];
    const seen = new Set();
    for (const c of normalized) {
      if (!seen.has(c.code)) {
        seen.add(c.code);
        unique.push(c);
      }
    }

    // The shared client returns the API envelope, not an Axios response.
    // Persist locally and notify subscribers only after confirmed server success.
    const response = await apiClient.put('/api/v1/settings/country', {
      countries: unique.map((c) => ({ country: c.name, countryCode: c.code, phoneCode: c.phoneCode, currency: c.currency })),
    });
    if (response?.success !== true) {
      throw new Error(response?.message || 'Country settings could not be saved. Please try again.');
    }
    if (scope && scope === getSessionScope()) {
      confirmedSelection = { scope, countries: unique };
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(REGIONAL_SETTINGS_EVENT));
    }
    const backendStatus = { backendBlocked: false, message: response.message || 'Country settings saved successfully.' };

    return {
      selectedCountries: unique,
      ...backendStatus,
    };
  },
};

export function useRegionalSettings() {
  const scope = getSessionScope();
  const [selection, setSelection] = useState(() => ({ scope, countries: regionalSettingsService.getSelectedCountries() }));
  const selectedCountries = selection.scope === scope && scope ? selection.countries : EMPTY_COUNTRIES;
  const setSelectedCountries = countries => setSelection({ scope: getSessionScope(), countries });

  useEffect(() => {
    const handleUpdate = () => setSelectedCountries(regionalSettingsService.getSelectedCountries());
    const handleStorage = (e) => {
      if (e.key === null || e.key === 'billing_auth_user' || e.key === 'billing_auth_token') {
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
