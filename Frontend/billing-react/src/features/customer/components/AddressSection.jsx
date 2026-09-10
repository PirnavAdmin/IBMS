export const AddressSection = ({
  prefix,
  title,
  register,
  errors = {},
  disabled = false,
  values = {},
  onChange,
}) => {
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
  const cityError = getError('city');
  const stateError = getError('state');
  const postalCodeError = getError('postalCode');
  const countryError = getError('country');

  return (
    <div className={`cust-address-section ${disabled ? 'is-disabled' : ''}`}>
      <h3 className="cust-section-title">{title}</h3>
      <div className="cust-grid cust-grid-2">
        <div className="cust-field cust-col-span-2">
          <label htmlFor={getFieldId('street')}>
            Street Address <span className="cust-required">*</span>
          </label>
          <input
            id={getFieldId('street')}
            type="text"
            placeholder="e.g. Plot 14, Software Units Layout, HITEC City"
            disabled={disabled}
            aria-invalid={Boolean(streetError)}
            aria-describedby={streetError ? `${getFieldId('street')}-err` : undefined}
            {...(register
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

        <div className="cust-field">
          <label htmlFor={getFieldId('city')}>
            City <span className="cust-required">*</span>
          </label>
          <input
            id={getFieldId('city')}
            type="text"
            placeholder="e.g. Hyderabad"
            disabled={disabled}
            aria-invalid={Boolean(cityError)}
            aria-describedby={cityError ? `${getFieldId('city')}-err` : undefined}
            {...(register
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

        <div className="cust-field">
          <label htmlFor={getFieldId('state')}>
            State / Region <span className="cust-required">*</span>
          </label>
          <input
            id={getFieldId('state')}
            type="text"
            placeholder="e.g. Telangana"
            disabled={disabled}
            aria-invalid={Boolean(stateError)}
            aria-describedby={stateError ? `${getFieldId('state')}-err` : undefined}
            {...(register
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

        <div className="cust-field">
          <label htmlFor={getFieldId('postalCode')}>
            Postal / PIN Code <span className="cust-required">*</span>
          </label>
          <input
            id={getFieldId('postalCode')}
            type="text"
            placeholder="e.g. 500081"
            disabled={disabled}
            aria-invalid={Boolean(postalCodeError)}
            aria-describedby={postalCodeError ? `${getFieldId('postalCode')}-err` : undefined}
            {...(register
              ? register(`${prefix}.postalCode`)
              : {
                  value: values.postalCode || '',
                  onChange: (e) => onChange && onChange('postalCode', e.target.value),
                })}
          />
          {postalCodeError && (
            <span id={`${getFieldId('postalCode')}-err`} className="cust-field-error" role="alert">
              {postalCodeError}
            </span>
          )}
        </div>

        <div className="cust-field">
          <label htmlFor={getFieldId('country')}>
            Country <span className="cust-required">*</span>
          </label>
          <select
            id={getFieldId('country')}
            disabled={disabled}
            aria-invalid={Boolean(countryError)}
            aria-describedby={countryError ? `${getFieldId('country')}-err` : undefined}
            {...(register
              ? register(`${prefix}.country`)
              : {
                  value: values.country || 'India',
                  onChange: (e) => onChange && onChange('country', e.target.value),
                })}
          >
            <option value="India">India</option>
            <option value="United States">United States</option>
            <option value="United Kingdom">United Kingdom</option>
            <option value="Singapore">Singapore</option>
            <option value="United Arab Emirates">United Arab Emirates</option>
            <option value="Australia">Australia</option>
          </select>
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
