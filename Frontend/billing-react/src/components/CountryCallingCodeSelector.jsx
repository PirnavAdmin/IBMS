import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search } from '@mui/icons-material';
import {
  useRegionalSettings,
  COUNTRIES_LIST,
  findCountryByCallingCode,
} from '../services/regionalSettingsService';
import { CountryFlag } from './CountryFlag';
import './CountryCallingCodeSelector.css';

/**
 * CountryCallingCodeSelector
 *
 * A reusable Country Calling Code Selector component for all 195 countries.
 *
 * Requirements:
 * 1. Closed state displays ONLY: [ 🇮🇳  +91  ▾ ] (no country name in closed state).
 * 2. Dropdown displays: [ Flag | Country Name | Calling Code ] across all 195 countries.
 * 3. Default selection is supplied by the Country configured in INVOICE.BILLING Settings.
 * 4. Separate from phone number input; preserves existing form validation & entered number.
 * 5. Handles shared calling codes (e.g. US/Canada +1, Italy/Holy See +39).
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
  } = useRegionalSettings();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedCountryObj, setSelectedCountryObj] = useState(null);

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
    // Default to India if available, else first country
    return COUNTRIES_LIST.find((c) => c.code === 'IN') || COUNTRIES_LIST[0];
  }, [defaultCountryCode, settingsDefaultCountry, selectedCountries]);

  // 2. Active list of countries: Complete 195 countries unless specific list is provided
  const countryList = useMemo(() => {
    if (Array.isArray(countries) && countries.length > 0) {
      return countries;
    }
    return COUNTRIES_LIST;
  }, [countries]);

  // 3. Resolve the currently active country object based on value & state (handles shared calling codes)
  const currentCountry = useMemo(() => {
    if (selectedCountryObj && (selectedCountryObj.phoneCode === value || !value)) {
      return selectedCountryObj;
    }
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
  }, [value, selectedCountryObj, defaultCountry]);

  // Sync default country calling code with parent form when empty
  useEffect(() => {
    if (!value && defaultCountry?.phoneCode && autoSelectDefault && onChange) {
      setSelectedCountryObj(defaultCountry);
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
    setSelectedCountryObj(country);
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
          <CountryFlag
            code={currentCountry?.code}
            name={currentCountry?.name}
            width={20}
            height={15}
          />
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
                      <CountryFlag
                        code={c.code}
                        name={c.name}
                        width={20}
                        height={15}
                      />
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
