import * as yup from 'yup';

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_REGEX = /^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s./0-9]*$/;
const POSTAL_REGEX = /^[A-Za-z0-9\s-]{3,16}$/;
const TAX_ID_REGEX = /^[A-Za-z0-9\s-]{3,64}$/;
const URL_REGEX = /^(https?:\/\/)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/i;

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
    .max(64, 'Customer code must not exceed 64 characters')
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),
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
    .max(64, 'Phone number must not exceed 64 characters')
    .test('phone-format', 'Enter a valid phone number', (val) => {
      if (!val || val.trim() === '') return true;
      return PHONE_REGEX.test(val.trim());
    })
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),
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
    .oneOf(['gst', 'pan', 'non-gst'])
    .default('gst'),
  taxId: yup
    .string()
    .trim()
    .max(64, 'Tax ID must not exceed 64 characters')
    .when('taxRegistrationType', {
      is: 'gst',
      then: (schema) =>
        schema.test('gstin-format', 'Enter a valid 15-character GSTIN (e.g. 36AAACD1234F1Z8)', (val) => {
          if (!val || val.trim() === '') return true;
          return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(val.trim());
        }),
      otherwise: (schema) =>
        schema.test('taxid-format', 'Enter a valid Tax ID / PAN', (val) => {
          if (!val || val.trim() === '') return true;
          return TAX_ID_REGEX.test(val.trim());
        }),
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
      .test('billing-postal-format', 'Enter a valid postal code', (val) => {
        if (!val || val.trim() === '') return true;
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
          .test('shipping-postal-format', 'Enter a valid postal code', (val) => {
            if (!val || val.trim() === '') return true;
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
