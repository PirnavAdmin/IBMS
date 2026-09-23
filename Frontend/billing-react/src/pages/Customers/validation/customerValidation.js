import * as yup from 'yup';

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_REGEX = /^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s./0-9]*$/;
const POSTAL_REGEX = /^[A-Za-z0-9\s-]{3,16}$/;
const TAX_ID_REGEX = /^[A-Za-z0-9\s-]{3,64}$/;
const INDIA_PIN_REGEX = /^[1-9][0-9]{5}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const URL_REGEX = /^(https?:\/\/)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/i;

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
};

export const customerValidationSchema = yup.object({
  // 1. Basic Information
  name: yup
    .string()
    .trim()
    .required('Contact / Customer name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(256, 'Name must not exceed 256 characters'),
  customerCode: yup
    .string()
    .trim()
    .required('Customer code is required')
    .max(64, 'Customer code must not exceed 64 characters'),
  companyName: yup
    .string()
    .trim()
    .max(256, 'Company name must not exceed 256 characters')
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
    .transform((val) => {
      if (!val) return 'business';
      const s = String(val).trim().toLowerCase();
      return ['business', 'individual', 'organization'].includes(s) ? s : 'business';
    })
    .oneOf(['business', 'individual', 'organization'])
    .default('business'),

  // 2. Contact Information
  email: yup
    .string()
    .trim()
    .required('Email address is required')
    .matches(EMAIL_REGEX, 'Enter a valid email address')
    .max(256, 'Email must not exceed 256 characters'),
  phoneCountryCode: yup
    .string()
    .trim()
    .default('+91'),
  phone: yup
    .string()
    .trim()
    .required('Phone number is required')
    .test('phone-digits', 'Phone number must contain only numbers and standard separators', (val) => {
      if (!val || !val.trim()) return false;
      return /^[0-9\s\-()+.]+$/.test(val.trim());
    })
    .test('country-phone-length', function (val) {
      if (!val || !val.trim()) return false;
      let digits = val.replace(/\D/g, '');
      const code = this.parent?.phoneCountryCode || '+91';
      const config = COUNTRY_PHONE_CONFIG[code] || { country: 'Selected country', min: 7, max: 15, label: '7-15 digits' };
      const codeDigits = code.replace(/\D/g, '');
      if (digits.startsWith(codeDigits) && digits.length > config.max) {
        digits = digits.slice(codeDigits.length);
      }

      if (config.min === config.max) {
        if (digits.length !== config.min) {
          return this.createError({
            message: `Phone number for ${config.country} (${code}) must be exactly ${config.min} digits (currently entered ${digits.length} digits)`,
          });
        }
      } else {
        if (digits.length < config.min || digits.length > config.max) {
          return this.createError({
            message: `Phone number for ${config.country} (${code}) must be between ${config.min} and ${config.max} digits (currently entered ${digits.length} digits)`,
          });
        }
      }
      return true;
    }),
  website: yup
    .string()
    .trim()
    .max(256, 'Website URL must not exceed 256 characters')
    .test('website-url', 'Enter a valid website URL (e.g. https://example.com or www.example.com)', (val) => {
      if (!val || val.trim() === '') return true;
      return URL_REGEX.test(val.trim());
    })
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),

  // 3. Tax Information
  taxRegistrationType: yup
    .string()
    .required('Tax registration status is required')
    .oneOf(['gst', 'pan', 'non-gst'])
    .default('gst'),
  taxId: yup
    .string()
    .trim()
    .max(64, 'Tax ID must not exceed 64 characters')
    .when('taxRegistrationType', ([type], schema) => {
      if (type === 'gst') {
        return schema
          .required('GSTIN is required for GST registered customers')
          .test('gstin-format', 'Enter a valid 15-character GSTIN (e.g. 36AAACD1234F1Z8)', (val) => {
            if (!val || val.trim() === '') return false;
            return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(val.trim());
          });
      }
      if (type === 'pan') {
        return schema
          .required('PAN is required')
          .test('pan-format', 'Enter a valid 10-character PAN (e.g. ABCDE1234F)', (val) => {
            if (!val || val.trim() === '') return false;
            return PAN_REGEX.test(val.trim());
          });
      }
      return schema
        .test('taxid-format', 'Enter a valid Tax ID / PAN', (val) => {
          if (!val || val.trim() === '') return true;
          return TAX_ID_REGEX.test(val.trim());
        })
        .nullable();
    })
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),

  // 4. Billing Address
  billingAddress: yup.object({
    street: yup
      .string()
      .trim()
      .required('Billing street address is required')
      .max(512, 'Street address must not exceed 512 characters'),
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
        if (this.parent.country === 'India')
          return INDIA_PIN_REGEX.test(val.trim()) || this.createError({ message: 'Enter exactly 6 digits for the Indian PIN code' });
        return POSTAL_REGEX.test(val.trim());
      }),
    country: yup
      .string()
      .trim()
      .required('Billing country is required')
      .max(128, 'Country must not exceed 128 characters')
      .default('India'),
  }).required(),

  // 5. Shipping Address
  isShippingSameAsBilling: yup.boolean().default(true),
  shippingAddress: yup.object().when('isShippingSameAsBilling', {
    is: false,
    then: (schema) =>
      schema.shape({
        street: yup
          .string()
          .trim()
          .required('Shipping street address is required')
          .max(512, 'Street address must not exceed 512 characters'),
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
            if (this.parent.country === 'India')
              return INDIA_PIN_REGEX.test(val.trim()) || this.createError({ message: 'Enter exactly 6 digits for the Indian PIN code' });
            return POSTAL_REGEX.test(val.trim());
          }),
        country: yup
          .string()
          .trim()
          .required('Shipping country is required')
          .max(128, 'Country must not exceed 128 characters')
          .default('India'),
      }),
    otherwise: (schema) => schema.notRequired(),
  }),

  // 6. Payment Information
  currency: yup
    .string()
    .trim()
    .max(10, 'Currency code must not exceed 10 characters')
    .default('INR'),
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
  customerType: 'business',
  companyName: '',
  status: 'Active',
  email: '',
  phoneCountryCode: '+91',
  phone: '',
  website: '',
  taxRegistrationType: 'gst',
  taxId: '',
  gstin: '',
  currency: 'INR',
  paymentTerms: 'Net 30',
  creditLimit: '',
  openingBalance: '',
  notes: '',
  isShippingSameAsBilling: true,
  billingAddress: {
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
  },
  shippingAddress: {
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
  },
};

export const STEP_FIELDS = {
  0: ['name', 'customerCode', 'companyName', 'customerType', 'status'],
  1: ['email', 'phoneCountryCode', 'phone', 'website'],
  2: ['taxRegistrationType', 'taxId', 'currency', 'paymentTerms', 'creditLimit', 'openingBalance'],
  3: ['billingAddress.street', 'billingAddress.city', 'billingAddress.state', 'billingAddress.postalCode', 'billingAddress.country', 'isShippingSameAsBilling', 'shippingAddress.street', 'shippingAddress.city', 'shippingAddress.state', 'shippingAddress.postalCode', 'shippingAddress.country'],
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
