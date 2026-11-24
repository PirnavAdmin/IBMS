import * as yup from 'yup';
import { hasRecognizedEmailDomain, hasExcessiveNameRepetition } from '../../../utils/authValidation.js';

function parsePhoneNumberFromString(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const normalized = text.startsWith('+') ? text : `+${text}`;
  const match = normalized.match(/^\+(\d+)\s*(.*)$/);
  if (!match) return null;

  const countryCallingCode = match[1];
  const nationalNumber = match[2].replace(/\D/g, '');

  return {
    countryCallingCode,
    nationalNumber,
    isValid: () => nationalNumber.length >= 7,
  };
}

export const EMAIL_REGEX = /^[a-zA-Z0-9]+([._+-][a-zA-Z0-9]+)*@[a-zA-Z0-9]+([.-][a-zA-Z0-9]+)*\.(?:[a-zA-Z]{2,}|xn--[a-zA-Z0-9-]+)$/;
const PHONE_REGEX = /^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s./0-9]*$/;
export const POSTAL_REGEX = /^[A-Za-z0-9\s-]{3,16}$/;
export const TAX_ID_REGEX = /^[A-Za-z0-9\s-]{3,64}$/;
export const INDIA_PIN_REGEX = /^[1-9][0-9]{5}$/;
export const STREET_ADDRESS_REGEX = /^[\p{L}\p{M}0-9\s,.\-/#':()]+$/u;
export const CONSECUTIVE_ADDRESS_SYMBOLS_REGEX = /[,.\-/#':().]{2,}/;
export const COMPANY_NAME_REGEX = /^[\p{L}\p{M}0-9\s.,&'\-()]+$/u;
export const CONSECUTIVE_COMPANY_SYMBOLS_REGEX = /[.,&'\-()]{2,}/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
export const URL_REGEX = /^(https?:\/\/)?(([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})(:\d{1,5})?(\/[a-zA-Z0-9\-._~%!$&'()*+,;=:@/?#]*)?$/i;

export function isValidWebsiteUrl(val) {
  if (!val || val.trim() === '') return true;
  const trimmed = val.trim();
  if (/[<>"'`\\^|{}\s]/.test(trimmed)) return false;
  if (!URL_REGEX.test(trimmed)) return false;

  try {
    const urlToTest = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(urlToTest);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (!parsed.hostname || !parsed.hostname.includes('.')) return false;
    const labels = parsed.hostname.split('.');
    if (labels.some((l) => !l || l.startsWith('-') || l.endsWith('-'))) return false;
    const tld = labels[labels.length - 1];
    if (!/^[a-zA-Z]{2,}$/.test(tld)) return false;
  } catch {
    return false;
  }
  return true;
}

export const COUNTRY_PHONE_CONFIG = {
  '+91': { country: 'India', code: 'IN', min: 10, max: 10, example: '98490 12345', label: '10 digits' },
  '+1': { country: 'USA / Canada', code: 'US', min: 10, max: 10, example: '202 555 0143', label: '10 digits' },
  '+44': { country: 'UK', code: 'UK', min: 10, max: 10, example: '7911 123456', label: '10 digits' },
  '+971': { country: 'UAE', code: 'AE', min: 9, max: 9, example: '50 123 4567', label: '9 digits' },
  '+65': { country: 'Singapore', code: 'SG', min: 8, max: 8, example: '8123 4567', label: '8 digits' },
  '+61': { country: 'Australia', code: 'AU', min: 9, max: 9, example: '412 345 678', label: '9 digits' },
  '+49': { country: 'Germany', code: 'DE', min: 10, max: 11, example: '151 12345678', label: '10-11 digits' },
  '+33': { country: 'France', code: 'FR', min: 9, max: 9, example: '6 12 34 56 78', label: '9 digits' },
  '+81': { country: 'Japan', code: 'JP', min: 10, max: 10, example: '90 1234 5678', label: '10 digits' },
  '+966': { country: 'Saudi Arabia', code: 'SA', min: 9, max: 9, example: '50 123 4567', label: '9 digits' },
  '+64': { country: 'New Zealand', code: 'NZ', min: 9, max: 10, example: '21 123 4567', label: '9-10 digits' },
  '+27': { country: 'South Africa', code: 'ZA', min: 9, max: 9, example: '71 123 4567', label: '9 digits' },
  '+353': { country: 'Ireland', code: 'IE', min: 9, max: 9, example: '85 123 4567', label: '9 digits' },
  '+39': { country: 'Italy', code: 'IT', min: 9, max: 10, example: '312 345 6789', label: '9-10 digits' },
  '+34': { country: 'Spain', code: 'ES', min: 9, max: 9, example: '612 345 678', label: '9 digits' },
  '+31': { country: 'Netherlands', code: 'NL', min: 9, max: 9, example: '6 12345678', label: '9 digits' },
  '+41': { country: 'Switzerland', code: 'CH', min: 9, max: 9, example: '78 123 4567', label: '9 digits' },
  '+46': { country: 'Sweden', code: 'SE', min: 9, max: 9, example: '70 123 4567', label: '9 digits' },
  '+47': { country: 'Norway', code: 'NO', min: 8, max: 8, example: '412 34 567', label: '8 digits' },
  '+45': { country: 'Denmark', code: 'DK', min: 8, max: 8, example: '20 12 34 56', label: '8 digits' },
  '+60': { country: 'Malaysia', code: 'MY', min: 9, max: 10, example: '12 345 6789', label: '9-10 digits' },
  '+62': { country: 'Indonesia', code: 'ID', min: 9, max: 12, example: '812 3456 7890', label: '9-12 digits' },
  '+63': { country: 'Philippines', code: 'PH', min: 10, max: 10, example: '917 123 4567', label: '10 digits' },
  '+66': { country: 'Thailand', code: 'TH', min: 9, max: 9, example: '81 234 5678', label: '9 digits' },
  '+55': { country: 'Brazil', code: 'BR', min: 10, max: 11, example: '11 91234 5678', label: '10-11 digits' },
  '+52': { country: 'Mexico', code: 'MX', min: 10, max: 10, example: '55 1234 5678', label: '10 digits' },
  '+974': { country: 'Qatar', code: 'QA', min: 8, max: 8, example: '3312 3456', label: '8 digits' },
  '+965': { country: 'Kuwait', code: 'KW', min: 8, max: 8, example: '9123 4567', label: '8 digits' },
  '+86': { country: 'China', code: 'CN', min: 11, max: 11, example: '138 0013 8000', label: '11 digits' },
  '+82': { country: 'South Korea', code: 'KR', min: 9, max: 10, example: '10 1234 5678', label: '9-10 digits' },
};

export const customerValidationSchema = yup.object({
  // 1. Basic Information
  name: yup
    .string()
    .trim()
    .required('Customer name is required')
    .min(2, 'Customer name must be at least 2 characters')
    .max(100, 'Customer name must not exceed 100 characters')
    .test('no-numbers', 'Customer name must not contain numbers', (val) => {
      if (!val) return true;
      return !/\d/.test(val);
    })
    .matches(
      /^[\p{L}\p{M}][\p{L}\p{M}\s'-]*$/u,
      'Customer Name should not contain special characters'
    )
    .test('name-repetition', 'Customer name contains invalid repeated characters', (val) => {
      if (!val) return true;
      return !hasExcessiveNameRepetition(val);
    }),
  customerCode: yup
    .string()
    .trim()
    .required('Customer code is required')
    .max(64, 'Customer code must not exceed 64 characters'),
  companyName: yup
    .string()
    .trim()
    .max(256, 'Company name must not exceed 256 characters')
    .test(
      'company-min-length',
      'Company name must be at least 2 characters',
      val => !val || val.trim().length >= 2
    )
    .test(
      'company-valid-chars',
      "Company name can only contain letters, numbers, spaces, and standard characters (., &, ', -, ())",
      val => !val || COMPANY_NAME_REGEX.test(val.trim())
    )
    .test(
      'company-no-consecutive',
      'Company name cannot contain consecutive special characters',
      val => !val || !CONSECUTIVE_COMPANY_SYMBOLS_REGEX.test(val.trim())
    )
    .test(
      'company-has-alphanumeric',
      'Company name must contain letters or numbers',
      val => !val || /[\p{L}0-9]/u.test(val.trim())
    )
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),
  status: yup
    .string()
    .transform((val) => {
      if (!val) return 'Active';
      const s = String(val).trim().toLowerCase();
      return s === 'inactive' ? 'Inactive' : 'Active';
    })
    .oneOf(['Active', 'Inactive'])
    .default('Active'),
  customerType: yup
    .string()
    .trim()
    .lowercase()
    .oneOf(['', 'business', 'individual', 'organization'])
    .default(''),
  customerCategory: yup
    .string()
    .nullable()
    .default('Enterprise'),

  // 2. Contact Information
  email: yup
    .string()
    .trim()
    .required('Email address is required')
    .max(256, 'Email must not exceed 256 characters')
    .matches(EMAIL_REGEX, { message: 'Please enter a valid email address', excludeEmptyString: true })
    .test(
      'recognized-email-domain',
      'Please enter a valid email address with a valid domain',
      (val) => {
        if (!val || val.trim() === '') return true;
        return hasRecognizedEmailDomain(val.trim());
      }
    ),
  phoneCountryCode: yup
    .string()
    .trim()
    .default(''),
  phone: yup
    .string()
    .trim()
    .required('Mobile number is required')
    .test('phone-digits', 'Mobile number must contain digits only', function (val) {
      if (!val) return true;
      return /^[0-9]+$/.test(val);
    })
    .test('phone-length', 'Enter a complete phone number', function (val) {
      if (!val) return true;
      const code = this.parent.phoneCountryCode;
      const config = code ? COUNTRY_PHONE_CONFIG[code] : null;
      const digits = val.length;

      if (code === '+91') {
        if (digits !== 10) {
          return this.createError({
            message: 'Mobile number must be exactly 10 digits',
          });
        }
        if (!/^[6-9]/.test(val)) {
          return this.createError({
            message: 'Indian mobile numbers must start with 6, 7, 8 or 9',
          });
        }
        return true;
      }

      if (config) {
        if (digits < config.min || digits > config.max) {
          return this.createError({
            message: `Phone number for ${config.country} (${code}) requires ${config.label} (currently entered ${digits} digits)`,
          });
        }
        return true;
      }

      if (digits < 7 || digits > 15) {
        return this.createError({
          message: 'Phone number must be between 7 and 15 digits',
        });
      }
      return true;
    }),
  website: yup
    .string()
    .trim()
    .max(256, 'Website URL must not exceed 256 characters')
    .test('website-url', 'Please enter a valid website URL.', (val) => isValidWebsiteUrl(val))
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),

  // 3. Tax Information
  taxRegistrationType: yup
    .string()
    .trim()
    .required('Tax registration status is required')
    .oneOf(['gst', 'non-gst', 'pan'], 'Please select a valid tax registration status'),
  pan: yup
    .string()
    .trim()
    .required('PAN is required')
    .test('pan-format', 'Enter a valid 10-character PAN (e.g. ABCDE1234F)', (val) => {
      if (!val || val.trim() === '') return false;
      return PAN_REGEX.test(val.trim().toUpperCase());
    }),
  gstin: yup
    .string()
    .trim()
    .when('taxRegistrationType', ([type], schema) => {
      if (type === 'gst') {
        return schema
          .required('GSTIN is required for GST registered customers')
          .test('gstin-format', 'Enter a valid 15-character GSTIN (e.g. 36AAACD1234F1Z8)', (val) => {
            if (!val || val.trim() === '') return false;
            return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(val.trim());
          });
      }
      return schema.nullable();
    })
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),
  taxId: yup
    .string()
    .trim()
    .max(64, 'Tax ID must not exceed 64 characters')
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),

  // 4. Billing Address
  billingAddress: yup.object({
    street: yup
      .string()
      .trim()
      .required('Billing street address is required')
      .min(3, 'Street address must be at least 3 characters')
      .max(512, 'Street address must not exceed 512 characters')
      .matches(
        STREET_ADDRESS_REGEX,
        'Please enter a valid street address. Unsupported special characters are not allowed.'
      )
      .test(
        'billing-street-no-consecutive',
        'Street address cannot contain consecutive special characters.',
        (val) => !CONSECUTIVE_ADDRESS_SYMBOLS_REGEX.test(val || '')
      )
      .test(
        'billing-street-has-alphanumeric',
        'Street address must contain letters or numbers.',
        (val) => /[\p{L}0-9]/u.test(val || '')
      ),
    addressLine2: yup
      .string()
      .trim()
      .max(256, 'Address line 2 must not exceed 256 characters')
      .test(
        'billing-addr2-valid-chars',
        'Please enter a valid address. Unsupported special characters are not allowed.',
        (val) => {
          if (!val || val.trim() === '') return true;
          return STREET_ADDRESS_REGEX.test(val.trim());
        }
      )
      .test(
        'billing-addr2-no-consecutive',
        'Address cannot contain consecutive special characters.',
        (val) => {
          if (!val || val.trim() === '') return true;
          return !CONSECUTIVE_ADDRESS_SYMBOLS_REGEX.test(val.trim());
        }
      )
      .nullable()
      .transform((curr, orig) => (orig === '' ? null : curr)),
    city: yup
      .string()
      .trim()
      .required('Billing city is required')
      .max(128, 'City must not exceed 128 characters'),
    state: yup
      .string()
      .trim()
      .required('Billing state is required')
      .max(128, 'State must not exceed 128 characters'),
    postalCode: yup
      .string()
      .trim()
      .required('Billing postal code is required')
      .max(32, 'Postal code must not exceed 32 characters')
      .test('billing-postal-format', 'Enter a valid postal code', function (val) {
        if (!val || val.trim() === '') return true;
        const trimmed = val.trim();
        const country = String(this.parent?.country || '').trim();
        const isIndia = !country || country.toLowerCase() === 'india';
        if (isIndia) {
          return INDIA_PIN_REGEX.test(trimmed) || this.createError({ message: 'Enter exactly 6 digits for the Indian PIN code' });
        }
        if (INDIA_PIN_REGEX.test(trimmed) && country.toLowerCase() !== 'india') {
          return this.createError({ message: 'Selected country is inconsistent with the entered PIN code.' });
        }
        return POSTAL_REGEX.test(trimmed);
      }),
    country: yup
      .string()
      .trim()
      .required('Billing country is required')
      .max(128, 'Country must not exceed 128 characters')
      .test('billing-country-pin-consistency', 'Selected country is inconsistent with the entered PIN code.', function (val) {
        if (!val || val.trim() === '') return true;
        const postal = String(this.parent?.postalCode || '').trim();
        if (!postal) return true;
        const isIndia = val.trim().toLowerCase() === 'india';
        if (!isIndia && INDIA_PIN_REGEX.test(postal)) {
          return this.createError({ message: 'Selected country is inconsistent with the entered PIN code.' });
        }
        return true;
      }),
  }).required(),

  // 5. Shipping Address
  isShippingSameAsBilling: yup.boolean().default(false),
  shippingAddress: yup.object().when('isShippingSameAsBilling', {
    is: false,
    then: (schema) =>
      schema.shape({
        street: yup
          .string()
          .trim()
          .required('Shipping street address is required')
          .min(3, 'Street address must be at least 3 characters')
          .max(512, 'Street address must not exceed 512 characters')
          .matches(
            STREET_ADDRESS_REGEX,
            'Please enter a valid street address. Unsupported special characters are not allowed.'
          )
          .test(
            'shipping-street-no-consecutive',
            'Street address cannot contain consecutive special characters.',
            (val) => !CONSECUTIVE_ADDRESS_SYMBOLS_REGEX.test(val || '')
          )
          .test(
            'shipping-street-has-alphanumeric',
            'Street address must contain letters or numbers.',
            (val) => !val || /[\p{L}0-9]/u.test(val)
          ),
        addressLine2: yup
          .string()
          .trim()
          .max(256, 'Address line 2 must not exceed 256 characters')
          .test(
            'shipping-addr2-valid-chars',
            'Please enter a valid address. Unsupported special characters are not allowed.',
            (val) => {
              if (!val || val.trim() === '') return true;
              return STREET_ADDRESS_REGEX.test(val.trim());
            }
          )
          .test(
            'shipping-addr2-no-consecutive',
            'Address cannot contain consecutive special characters.',
            (val) => {
              if (!val || val.trim() === '') return true;
              return !CONSECUTIVE_ADDRESS_SYMBOLS_REGEX.test(val.trim());
            }
          )
          .nullable()
          .transform((curr, orig) => (orig === '' ? null : curr)),
        city: yup
          .string()
          .trim()
          .required('Shipping city is required')
          .max(128, 'City must not exceed 128 characters'),
        state: yup
          .string()
          .trim()
          .required('Shipping state is required')
          .max(128, 'State must not exceed 128 characters'),
        postalCode: yup
          .string()
          .trim()
          .required('Shipping postal code is required')
          .max(32, 'Postal code must not exceed 32 characters')
          .test('shipping-postal-format', 'Enter a valid postal code', function (val) {
            if (!val || val.trim() === '') return true;
            const trimmed = val.trim();
            const country = String(this.parent?.country || '').trim();
            const isIndia = !country || country.toLowerCase() === 'india';
            if (isIndia) {
              return INDIA_PIN_REGEX.test(trimmed) || this.createError({ message: 'Enter exactly 6 digits for the Indian PIN code' });
            }
            if (INDIA_PIN_REGEX.test(trimmed) && country.toLowerCase() !== 'india') {
              return this.createError({ message: 'Selected country is inconsistent with the entered PIN code.' });
            }
            return POSTAL_REGEX.test(trimmed);
          }),
        country: yup
          .string()
          .trim()
          .required('Shipping country is required')
          .max(128, 'Country must not exceed 128 characters')
          .test('shipping-country-pin-consistency', 'Selected country is inconsistent with the entered PIN code.', function (val) {
            if (!val || val.trim() === '') return true;
            const postal = String(this.parent?.postalCode || '').trim();
            if (!postal) return true;
            const isIndia = val.trim().toLowerCase() === 'india';
            if (!isIndia && INDIA_PIN_REGEX.test(postal)) {
              return this.createError({ message: 'Selected country is inconsistent with the entered PIN code.' });
            }
            return true;
          }),
      }),
    otherwise: (schema) => schema.notRequired(),
  }),

  // 6. Payment Information
  currency: yup
    .string()
    .trim()
    .required('Currency is required')
    .max(10, 'Currency code must not exceed 10 characters'),
  paymentTerms: yup
    .string()
    .trim()
    .max(64, 'Payment terms must not exceed 64 characters')
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),
  creditLimit: yup
    .number()
    .transform((curr, orig) => (orig === '' || orig === null || isNaN(curr) ? 0 : curr))
    .min(0, 'Credit limit cannot be negative')
    .nullable()
    .default(0),
  openingBalance: yup
    .number()
    .transform((curr, orig) => (orig === '' || orig === null || isNaN(curr) ? 0 : curr))
    .nullable()
    .default(0),

  // 7. Additional Information
  notes: yup
    .string()
    .trim()
    .max(1000, 'Notes must not exceed 1000 characters')
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),
});

export const DEFAULT_CUSTOMER_VALUES = {
  name: '',
  customerCode: '',
  customerType: '',
  customerCategory: 'Enterprise',
  companyName: '',
  status: 'Active',
  email: '',
  phoneCountryCode: '',
  phone: '',
  website: '',
  taxRegistrationType: '',
  pan: '',
  gstin: '',
  taxId: '',
  currency: '',
  paymentTerms: '',
  creditLimit: '',
  openingBalance: '',
  notes: '',
  isShippingSameAsBilling: false,
  billingAddress: {
    street: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
  },
  shippingAddress: {
    street: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
  },
};

export const STEP_FIELDS = {
  0: ['name', 'customerCode', 'companyName', 'customerType', 'status', 'currency'],
  1: ['email', 'phoneCountryCode', 'phone', 'website'],
  2: ['taxRegistrationType', 'pan', 'gstin', 'openingBalance'],
  3: ['billingAddress.street', 'billingAddress.city', 'billingAddress.state', 'billingAddress.postalCode', 'billingAddress.country', 'isShippingSameAsBilling'],
  4: ['notes'],
};

export const getNextCustomerCode = (existingItems = []) => {
  let maxNum = 0;
  if (Array.isArray(existingItems)) {
    for (const item of existingItems) {
      const code = typeof item === 'string' ? item : item?.customerCode || item?.code || item?.CustomerCode || '';
      if (code) {
        const match = code.trim().match(/^CUST\s*-\s*(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num < 100000 && num > maxNum) {
            maxNum = num;
          }
        }
      }
    }
  }
  const nextNum = maxNum + 1;
  return `CUST-${String(nextNum).padStart(3, '0')}`;
};

export function isDuplicatePhoneNumber(inputPhone, existingPhone) {
  if (!inputPhone || !existingPhone) return false;
  const cleanInput = String(inputPhone).trim();
  const cleanExisting = String(existingPhone).trim();
  if (!cleanInput || !cleanExisting) return false;

  if (cleanInput.toLowerCase() === cleanExisting.toLowerCase()) return true;

  const inputDigits = cleanInput.replace(/\D/g, '');
  const existingDigits = cleanExisting.replace(/\D/g, '');

  if (!inputDigits || !existingDigits) return false;
  if (inputDigits === existingDigits) return true;

  const bothHavePlus = cleanInput.startsWith('+') && cleanExisting.startsWith('+');
  if (bothHavePlus) return false;

  if (inputDigits.length >= 10 && existingDigits.length >= 10) {
    const inputLast10 = inputDigits.slice(-10);
    const existingLast10 = existingDigits.slice(-10);
    if (inputLast10 === existingLast10) return true;
  }

  return false;
}

export function validateDeactivationReason(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return { valid: false, error: 'Deactivation reason is required.' };
  }
  if (raw.length < 5) {
    return { valid: false, error: 'Deactivation reason must be at least 5 characters.' };
  }
  if (raw.length > 500) {
    return { valid: false, error: 'Deactivation reason cannot exceed 500 characters.' };
  }
  if (!/[a-zA-Z]/.test(raw)) {
    return { valid: false, error: 'Deactivation reason cannot contain only numbers or special characters.' };
  }
  const letters = raw.match(/[a-zA-Z]/g) || [];
  if (letters.length < 3) {
    return { valid: false, error: 'Deactivation reason must contain meaningful text with letters.' };
  }
  if (/[\^~$\\|<>{}`]/.test(raw)) {
    return { valid: false, error: 'Deactivation reason contains unsupported special characters.' };
  }
  const normalized = raw.replace(/\.{2,3}/g, ' ').replace(/-{2}/g, ' ');
  if (/[!@#$%^&*()_+=\-[\]{};':"\\|,.<>/?~`]{3,}/.test(normalized)) {
    return { valid: false, error: 'Deactivation reason contains excessive special characters.' };
  }
  const specialMatches = raw.match(/[^a-zA-Z0-9\s]/g) || [];
  if (raw.length >= 8 && (specialMatches.length / raw.length) > 0.25) {
    return { valid: false, error: 'Deactivation reason contains too many special characters.' };
  }
  if (/(.)\1{4,}/.test(raw)) {
    return { valid: false, error: 'Deactivation reason cannot contain repetitive meaningless characters.' };
  }
  return { valid: true, error: '' };
}
