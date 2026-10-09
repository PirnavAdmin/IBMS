import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search } from '@mui/icons-material';
import {
  useRegionalSettings,
  COUNTRIES_LIST,
  findCountryByCallingCode,
} from '../services/regionalSettingsService';
import './CountryCallingCodeSelector.css';

/**
 * CountryCallingCodeSelector
 *
 * A reusable Country Calling Code Selector component matching the INVOICE.BILLING design system.
 *
 * Requirements:
 * 1. Closed state displays ONLY: [ 🇮🇳  +91  ▾ ] (no country name in closed state).
 * 2. Dropdown displays: [ Flag | Country Name | Calling Code ] (e.g. 🇮🇳 India +91, 🇺🇸 United States +1).
 * 3. Default selection is supplied by the Country configured in INVOICE.BILLING Settings.
 * 4. Separate from phone number input; preserves existing form validation & entered number.
 */
export function CountryCallingCodeSelector({
  value,
  onChange,
  defaultCountryCode,
  countries,
  disabled = false,
  error = false,
  id = 'country-calling-code-selector',
  name = 'phoneCountryCode',
  className = '',
  ariaLabel = 'Country calling code',
  autoSelectDefault = true,
}) {
  const {
    defaultCountry: settingsDefaultCountry,
    selectedCountries,
    availableCountries = COUNTRIES_LIST,
  } = useRegionalSettings();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  // 1. Determine default country from INVOICE.BILLING Settings
  const defaultCountry = useMemo(() => {
    if (defaultCountryCode) {
      const match = findCountryByCallingCode(defaultCountryCode);
      if (match) return match;
    }
    if (settingsDefaultCountry) {
      return settingsDefaultCountry;
    }
    if (selectedCountries && selectedCountries.length > 0) {
      return selectedCountries[0];
    }
    // Fallback to first available country in metadata
    return COUNTRIES_LIST[0];
  }, [defaultCountryCode, settingsDefaultCountry, selectedCountries]);

  // 2. Determine active list of countries
  const countryList = useMemo(() => {
    let list = [];
    if (Array.isArray(countries) && countries.length > 0) {
      list = [...countries];
    } else if (selectedCountries && selectedCountries.length > 0) {
      list = [...selectedCountries];
    } else {
      list = availableCountries && availableCountries.length > 0 ? [...availableCountries] : [...COUNTRIES_LIST];
    }

    // If active country code is not in the list, include it so existing records remain intact
    if (value) {
      const match = findCountryByCallingCode(value, defaultCountry?.code);
      if (match && !list.some((c) => c.phoneCode === match.phoneCode && c.code === match.code)) {
        list.push(match);
      }
    }
    return list;
  }, [countries, selectedCountries, availableCountries, value, defaultCountry]);

  // 3. Resolve the currently active country object based on value
  const currentCountry = useMemo(() => {
    if (value) {
      const matched = findCountryByCallingCode(value, defaultCountry?.code);
      if (matched) return matched;
      return {
        name: value,
        code: '',
        phoneCode: value.startsWith('+') ? value : `+${value}`,
        flag: '🌐',
      };
    }
    return defaultCountry;
  }, [value, defaultCountry]);

  // Sync default country calling code with parent form when empty
  useEffect(() => {
    if (!value && defaultCountry?.phoneCode && autoSelectDefault && onChange) {
      onChange(defaultCountry.phoneCode, defaultCountry);
    }
  }, [value, defaultCountry, autoSelectDefault, onChange]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setHighlightedIndex(-1);
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Filtered country list based on search term
  const filteredCountries = useMemo(() => {
    if (!search.trim()) return countryList;
    const term = search.trim().toLowerCase();
    const cleanTerm = term.replace(/\+/g, '');
    return countryList.filter((c) => {
      const nameMatch = c.name?.toLowerCase().includes(term);
      const codeMatch = c.code?.toLowerCase().includes(term);
      const phoneMatch = c.phoneCode?.includes(term) || c.phoneCode?.replace(/\+/g, '').includes(cleanTerm);
      return nameMatch || codeMatch || phoneMatch;
    });
  }, [countryList, search]);

  const handleSelect = (country) => {
    if (disabled) return;
    setIsOpen(false);
    triggerRef.current?.focus();
    if (onChange) {
      onChange(country.phoneCode, country);
    }
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredCountries.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredCountries.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredCountries.length) {
        handleSelect(filteredCountries[highlightedIndex]);
      } else if (filteredCountries.length === 1) {
        handleSelect(filteredCountries[0]);
      }
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`country-calling-code-container ${className}`.trim()}
      onKeyDown={handleKeyDown}
    >
      {/* 1. Closed state: Displays ONLY Flag, Calling Code and Arrow */}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className={`country-calling-code-trigger ${isOpen ? 'open' : ''} ${
          error ? 'has-error' : ''
        }`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
      >
        <span className="calling-code-flag" aria-hidden="true">
          {currentCountry?.flag || '🌐'}
        </span>
        <span className="calling-code-text">
          {currentCountry?.phoneCode || value || '+91'}
        </span>
        <span className="calling-code-arrow" aria-hidden="true">
          ▾
        </span>
      </button>

      {/* 2. Dropdown popup: Displays Flag | Country Name | Calling Code */}
      {isOpen && (
        <div className="calling-code-dropdown">
          <div className="calling-code-search-wrap">
            <Search className="calling-code-search-icon" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              className="calling-code-search-input"
              placeholder="Search country or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search countries"
            />
            {search && (
              <button
                type="button"
                className="calling-code-clear-btn"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <ul
            ref={listRef}
            className="calling-code-list"
            role="listbox"
            aria-label="Available country calling codes"
          >
            {filteredCountries.length > 0 ? (
              filteredCountries.map((c, index) => {
                const isSelected =
                  currentCountry?.code === c.code ||
                  (currentCountry?.phoneCode === c.phoneCode && currentCountry?.name === c.name);
                const isHighlighted = highlightedIndex === index;

                return (
                  <li
                    key={`${c.code}-${c.phoneCode}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`calling-code-option ${
                      isSelected ? 'selected' : ''
                    } ${isHighlighted ? 'highlighted' : ''}`}
                    onClick={() => handleSelect(c)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <span className="calling-code-option-flag" aria-hidden="true">
                      {c.flag}
                    </span>
                    <span className="calling-code-option-name">{c.name}</span>
                    <span className="calling-code-option-code">
                      {c.phoneCode}
                    </span>
                  </li>
                );
              })
            ) : (
              <li className="calling-code-empty" role="none">
                No matching countries found
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default CountryCallingCodeSelector;
