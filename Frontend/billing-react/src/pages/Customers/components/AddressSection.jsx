import React, { useState, useCallback, useRef } from 'react';
import { lookupIndiaPincode } from '../../../services/postalService';
import { CheckCircleOutline, SyncOutlined } from '@mui/icons-material';
import { CustomerSelectField } from './CustomerSelectField';
import { useRegionalSettings } from '../../../services/regionalSettingsService';
import { CountryFlag } from '../../../components/CountryFlag';

export const AddressSection = ({
  prefix,
  title,
  register,
  control,
  setValue,
  trigger,
  getValues,
  watch,
  errors = {},
  disabled = false,
  country = '',
  values = {},
  onChange,
}) => {
  const { selectedCountries, availableCountries } = useRegionalSettings();
  const [lookupState, setLookupState] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [lookupMessage, setLookupMessage] = useState('');
  const [availableLocations, setAvailableLocations] = useState([]);
  const lastQueriedPinRef = useRef('');

  const getFieldId = (fieldName) => `${prefix}-${fieldName}`;
  const getError = (fieldName) => {
    return (
      errors?.[prefix]?.[fieldName]?.message ||
      errors?.[`${prefix}.${fieldName}`]?.message ||
      errors?.[`${prefix}.${fieldName}`] ||
      ''
    );
  };

  const streetError = getError('street');
  const addressLine2Error = getError('addressLine2');
  const cityError = getError('city');
  const stateError = getError('state');
  const postalCodeError = getError('postalCode');
  const countryError = getError('country');

  const currentCountry = (watch ? watch(`${prefix}.country`) : values.country) || country || '';
  const currentAddressLine2 = (watch ? watch(`${prefix}.addressLine2`) : values.addressLine2) || '';
  const currentPostalCode = (watch ? watch(`${prefix}.postalCode`) : values.postalCode) || '';
  const isIndia = !currentCountry || currentCountry.trim().toLowerCase() === 'india';

  const baseCountries = selectedCountries.length > 0 ? selectedCountries : availableCountries;
  const currentCountryExists = !currentCountry || baseCountries.some(
    (c) => c.name.toLowerCase() === currentCountry.toLowerCase()
  );
  const countryOptions = [
    { value: '', label: 'Select Country' },
    ...baseCountries.map((c) => ({
      value: c.name,
      label: c.name,
      icon: <CountryFlag code={c.code} name={c.name} width={18} height={13} />,
    })),
    ...(!currentCountryExists && currentCountry ? [{ value: currentCountry, label: currentCountry }] : []),
  ];

  const performPincodeLookup = useCallback(
    async (pin, { autoFill = true } = {}) => {
      if (disabled) return;
      const cleanPin = String(pin || '').trim().replace(/\D/g, '');
      if (cleanPin.length !== 6 || !/^[1-9][0-9]{5}$/.test(cleanPin)) {
        return;
      }

      lastQueriedPinRef.current = cleanPin;
      setLookupState('loading');
      setLookupMessage('Finding location details...');

      const result = await lookupIndiaPincode(cleanPin);

      // Verify the PIN hasn't changed while request was in-flight
      if (lastQueriedPinRef.current !== cleanPin) {
        return;
      }

      if (result.success) {
        setLookupState('success');
        setLookupMessage(`${result.city}, ${result.state} (${result.location})`);
        setAvailableLocations(result.allLocations || []);

        if (autoFill) {
          if (setValue) {
            // Auto-fill City (e.g. Hyderabad, Visakhapatnam)
            if (result.city) {
              setValue(`${prefix}.city`, result.city, { shouldValidate: true, shouldDirty: true });
            }
            // Auto-fill State (e.g. Telangana, Andhra Pradesh)
            if (result.state) {
              setValue(`${prefix}.state`, result.state, { shouldValidate: true, shouldDirty: true });
            }
            // Auto-fill Address Line 2 (Locality, e.g. Begumpet, Madhurawada)
            if (result.location) {
              setValue(`${prefix}.addressLine2`, result.location, { shouldValidate: true, shouldDirty: true });
            }
            // Auto-fill Country to India if unselected or default
            if (result.country || !currentCountry) {
              setValue(`${prefix}.country`, result.country || 'India', { shouldValidate: true, shouldDirty: true });
            }
            // Auto-refresh validation on touched fields
            if (trigger) {
              trigger([
                `${prefix}.city`,
                `${prefix}.state`,
                `${prefix}.postalCode`,
                `${prefix}.addressLine2`,
                `${prefix}.country`,
              ]);
            }
          } else if (onChange) {
            if (result.city) onChange('city', result.city);
            if (result.state) onChange('state', result.state);
            if (result.location) onChange('addressLine2', result.location);
            if (result.country || !currentCountry) onChange('country', result.country || 'India');
          }
        }
      } else {
        setLookupState('error');
        setLookupMessage(result.message || 'No records found for this PIN code');
        setAvailableLocations([]);
      }
    },
    [prefix, setValue, trigger, onChange, currentCountry]
  );

  const handlePostalCodeChange = (e) => {
    if (disabled) return;
    const rawVal = e.target.value;
    if (isIndia) {
      const cleanPin = rawVal.replace(/\D/g, '').slice(0, 6);
      if (setValue) {
        setValue(`${prefix}.postalCode`, cleanPin, { shouldValidate: true, shouldDirty: true });
      } else if (onChange) {
        onChange('postalCode', cleanPin);
      }

      if (cleanPin.length === 6 && /^[1-9][0-9]{5}$/.test(cleanPin)) {
        performPincodeLookup(cleanPin, { autoFill: true });
      } else if (cleanPin.length < 6) {
        setLookupState('idle');
        setLookupMessage('');
        setAvailableLocations([]);
      }
    } else {
      if (setValue) {
        setValue(`${prefix}.postalCode`, rawVal, { shouldValidate: true, shouldDirty: true });
      } else if (onChange) {
        onChange('postalCode', rawVal);
      }
    }
  };

  // Auto-trigger lookup if 6 digits are already present (e.g. from state or paste) but not yet looked up
  React.useEffect(() => {
    if (disabled) return;
    if (!isIndia) return;
    const cleanPin = String(currentPostalCode || '').trim().replace(/\D/g, '');
    if (cleanPin.length === 6 && /^[1-9][0-9]{5}$/.test(cleanPin)) {
      if (lastQueriedPinRef.current !== cleanPin) {
        performPincodeLookup(cleanPin, { autoFill: true });
      }
    }
  }, [disabled, isIndia, currentPostalCode, performPincodeLookup]);

  const handleSelectLocality = (locality) => {
    if (!locality || disabled) return;
    if (setValue) {
      setValue(`${prefix}.addressLine2`, locality, { shouldValidate: true, shouldDirty: true });
      if (trigger) {
        trigger(`${prefix}.addressLine2`);
      }
    } else if (onChange) {
      onChange('addressLine2', locality);
    }
  };

  return (
    <div className={`cust-address-section ${disabled ? 'is-disabled' : ''}`}>
      <h3 className="cust-section-title">{title}</h3>
      <div className="cust-grid cust-grid-2">
        {/* 1. Street Address */}
        <div className="cust-field cust-col-span-2">
          <label htmlFor={getFieldId('street')}>
            Street Address <span className="cust-required">*</span>
          </label>
          <input
            id={getFieldId('street')}
            type="text"
            placeholder={disabled ? 'Same as billing address' : 'e.g. Plot 14, Software Units Layout'}
            disabled={disabled}
            aria-invalid={Boolean(streetError)}
            aria-describedby={streetError ? `${getFieldId('street')}-err` : undefined}
            {...(disabled && watch
              ? { value: watch(`${prefix}.street`) || '', readOnly: true }
              : register
              ? register(`${prefix}.street`)
              : {
                  value: values.street || '',
                  onChange: (e) => onChange && onChange('street', e.target.value),
                })}
          />
          {streetError && (
            <span id={`${getFieldId('street')}-err`} className="cust-field-error" role="alert">
              {streetError}
            </span>
          )}
        </div>

        {/* 2. Address Line 2 / Locality */}
        <div className="cust-field cust-col-span-2">
          <label htmlFor={getFieldId('addressLine2')}>
            Address Line 2 (Area / Locality)
          </label>
          <input
            id={getFieldId('addressLine2')}
            type="text"
            list={`${getFieldId('addressLine2')}-list`}
            placeholder={disabled ? 'Same as billing address' : 'e.g. Madhurawada, Shaikpet, etc.'}
            disabled={disabled}
            aria-invalid={Boolean(addressLine2Error)}
            aria-describedby={addressLine2Error ? `${getFieldId('addressLine2')}-err` : undefined}
            {...(disabled && watch
              ? { value: watch(`${prefix}.addressLine2`) || '', readOnly: true }
              : register
              ? register(`${prefix}.addressLine2`)
              : {
                  value: values.addressLine2 || '',
                  onChange: (e) => onChange && onChange('addressLine2', e.target.value),
                })}
          />
          <datalist id={`${getFieldId('addressLine2')}-list`}>
            {availableLocations.map((loc) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>

          {/* Quick Area / Locality options if multiple post offices found */}
          {availableLocations.length > 1 && (
            <div className="cust-locality-chips">
              <span className="cust-locality-chips-label">Area options:</span>
              {availableLocations.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  className={`cust-locality-chip ${currentAddressLine2 === loc ? 'active' : ''}`}
                  onClick={() => handleSelectLocality(loc)}
                  disabled={disabled}
                >
                  {loc}
                </button>
              ))}
            </div>
          )}

          {addressLine2Error && (
            <span id={`${getFieldId('addressLine2')}-err`} className="cust-field-error" role="alert">
              {addressLine2Error}
            </span>
          )}
        </div>

        {/* 3. Postal / PIN Code (with instant lookup) */}
        <div className="cust-field">
          <label htmlFor={getFieldId('postalCode')}>
            Postal / PIN Code <span className="cust-required">*</span>
          </label>
          <div className="cust-input-with-action">
            <input
              id={getFieldId('postalCode')}
              type="text"
              inputMode={isIndia ? 'numeric' : 'text'}
              maxLength={isIndia ? 6 : 32}
              autoComplete="postal-code"
              placeholder={isIndia ? 'e.g. 500016 or 530048' : 'Postal code'}
              disabled={disabled}
              aria-invalid={Boolean(postalCodeError)}
              aria-describedby={
                postalCodeError
                  ? `${getFieldId('postalCode')}-err`
                  : `${getFieldId('postalCode')}-status`
              }
              {...(disabled && watch
                ? { value: watch(`${prefix}.postalCode`) || '', readOnly: true }
                : register
                ? register(`${prefix}.postalCode`, {
                    onChange: handlePostalCodeChange,
                  })
                : {
                    value: values.postalCode || '',
                    onChange: handlePostalCodeChange,
                  })}
              onBlur={() => {
                if (isIndia) {
                  const cleanPin = String(currentPostalCode || '').trim().replace(/\D/g, '');
                  if (cleanPin.length === 6 && /^[1-9][0-9]{5}$/.test(cleanPin)) {
                    if (lastQueriedPinRef.current !== cleanPin || lookupState !== 'success') {
                      performPincodeLookup(cleanPin, { autoFill: true });
                    }
                  }
                }
              }}
              onKeyDown={(e) => {
                if (isIndia) {
                  const allowed = [
                    'Backspace',
                    'Tab',
                    'Delete',
                    'ArrowLeft',
                    'ArrowRight',
                    'ArrowUp',
                    'ArrowDown',
                    'Home',
                    'End',
                    'Enter',
                  ];
                  if (allowed.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) {
                    return;
                  }
                  if (!/^[0-9]$/.test(e.key)) {
                    e.preventDefault();
                    return;
                  }
                  const input = e.currentTarget;
                  const selLen = (input.selectionEnd || 0) - (input.selectionStart || 0);
                  if (input.value.length >= 6 && selLen === 0) {
                    e.preventDefault();
                  }
                }
              }}
              onPaste={(e) => {
                if (isIndia) {
                  e.preventDefault();
                  const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
                  if (!pasted) return;
                  if (setValue) {
                    setValue(`${prefix}.postalCode`, pasted, { shouldValidate: true, shouldDirty: true });
                  } else if (onChange) {
                    onChange('postalCode', pasted);
                  }
                  if (pasted.length === 6 && /^[1-9][0-9]{5}$/.test(pasted)) {
                    performPincodeLookup(pasted, { autoFill: true });
                  }
                }
              }}
            />
            {!disabled && lookupState === 'loading' && (
              <span className="cust-input-status-icon cust-spin" aria-label="Looking up PIN details">
                <SyncOutlined fontSize="small" />
              </span>
            )}
            {!disabled && lookupState === 'success' && (
              <span className="cust-input-status-icon cust-success" aria-label="Location verified">
                <CheckCircleOutline fontSize="small" />
              </span>
            )}
          </div>

          {/* Feedback & Error / Success messages */}
          {postalCodeError ? (
            <span id={`${getFieldId('postalCode')}-err`} className="cust-field-error" role="alert">
              {postalCodeError}
            </span>
          ) : !disabled && lookupState === 'success' ? (
            <span id={`${getFieldId('postalCode')}-status`} className="cust-pin-status cust-pin-success">
              ✓ Auto-filled: {lookupMessage}
            </span>
          ) : !disabled && lookupState === 'loading' ? (
            <span id={`${getFieldId('postalCode')}-status`} className="cust-pin-status cust-pin-loading">
              Finding city, state & locality...
            </span>
          ) : !disabled && lookupState === 'error' ? (
            <span id={`${getFieldId('postalCode')}-status`} className="cust-pin-status cust-pin-warning">
              ℹ {lookupMessage} (Enter details manually)
            </span>
          ) : null}
        </div>

        {/* 4. City */}
        <div className="cust-field">
          <label htmlFor={getFieldId('city')}>
            City <span className="cust-required">*</span>
          </label>
          <input
            id={getFieldId('city')}
            type="text"
            placeholder={disabled ? 'Same as billing address' : 'e.g. Visakhapatnam'}
            disabled={disabled}
            aria-invalid={Boolean(cityError)}
            aria-describedby={cityError ? `${getFieldId('city')}-err` : undefined}
            {...(disabled && watch
              ? { value: watch(`${prefix}.city`) || '', readOnly: true }
              : register
              ? register(`${prefix}.city`)
              : {
                  value: values.city || '',
                  onChange: (e) => onChange && onChange('city', e.target.value),
                })}
          />
          {cityError && (
            <span id={`${getFieldId('city')}-err`} className="cust-field-error" role="alert">
              {cityError}
            </span>
          )}
        </div>

        {/* 5. State / Region */}
        <div className="cust-field">
          <label htmlFor={getFieldId('state')}>
            State / Region <span className="cust-required">*</span>
          </label>
          <input
            id={getFieldId('state')}
            type="text"
            placeholder={disabled ? 'Same as billing address' : 'e.g. Andhra Pradesh'}
            disabled={disabled}
            aria-invalid={Boolean(stateError)}
            aria-describedby={stateError ? `${getFieldId('state')}-err` : undefined}
            {...(disabled && watch
              ? { value: watch(`${prefix}.state`) || '', readOnly: true }
              : register
              ? register(`${prefix}.state`)
              : {
                  value: values.state || '',
                  onChange: (e) => onChange && onChange('state', e.target.value),
                })}
          />
          {stateError && (
            <span id={`${getFieldId('state')}-err`} className="cust-field-error" role="alert">
              {stateError}
            </span>
          )}
        </div>

        {/* 6. Country */}
        <div className="cust-field">
          <label htmlFor={getFieldId('country')}>
            Country <span className="cust-required">*</span>
          </label>
          {control ? (
            <CustomerSelectField
              control={control}
              name={`${prefix}.country`}
              id={getFieldId('country')}
              disabled={disabled}
              ariaLabel="Country"
              invalid={Boolean(countryError)}
              onValueChange={() => {
                setLookupState('idle');
                setLookupMessage('');
                setAvailableLocations([]);
              }}
              options={countryOptions}
            />
          ) : (
            <select
              id={getFieldId('country')}
              disabled={disabled}
              aria-invalid={Boolean(countryError)}
              aria-describedby={countryError ? `${getFieldId('country')}-err` : undefined}
              {...(register
                ? register(`${prefix}.country`, {
                    onChange: () => {
                      setLookupState('idle');
                      setLookupMessage('');
                      setAvailableLocations([]);
                    },
                  })
                : {
                    value: currentCountry || '',
                    onChange: (e) => {
                      setLookupState('idle');
                      setLookupMessage('');
                      setAvailableLocations([]);
                      if (onChange) onChange('country', e.target.value);
                    },
                  })}
            >
              {countryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          {countryError && (
            <span id={`${getFieldId('country')}-err`} className="cust-field-error" role="alert">
              {countryError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddressSection;
