import * as yup from 'yup';

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_REGEX = /^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s./0-9]*$/;

export const customerValidationSchema = yup.object({
  name: yup
    .string()
    .trim()
    .required('Contact name is required')
    .min(2, 'Contact name must be at least 2 characters')
    .max(256, 'Contact name must not exceed 256 characters'),
  companyName: yup
    .string()
    .trim()
    .max(256, 'Company name must not exceed 256 characters')
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),
  email: yup
    .string()
    .trim()
    .required('Email address is required')
    .matches(EMAIL_REGEX, 'Enter a valid email address')
    .max(256, 'Email must not exceed 256 characters'),
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
  gstin: yup
    .string()
    .trim()
    .max(64, 'Tax ID / GSTIN must not exceed 64 characters')
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),
  currency: yup
    .string()
    .trim()
    .max(10, 'Currency code must not exceed 10 characters')
    .default('INR'),
  status: yup
    .string()
    .oneOf(['Active', 'Inactive'])
    .default('Active'),
  notes: yup
    .string()
    .trim()
    .max(1000, 'Notes must not exceed 1000 characters')
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),
  website: yup
    .string()
    .trim()
    .max(256, 'Website URL must not exceed 256 characters')
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),
  paymentTerms: yup
    .string()
    .trim()
    .max(64, 'Payment terms must not exceed 64 characters')
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),
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
      .max(32, 'Postal code must not exceed 32 characters'),
    country: yup
      .string()
      .trim()
      .required('Billing country is required')
      .max(128, 'Country must not exceed 128 characters')
      .default('India'),
  }).required(),
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
          .max(32, 'Postal code must not exceed 32 characters'),
        country: yup
          .string()
          .trim()
          .required('Shipping country is required')
          .max(128, 'Country must not exceed 128 characters')
          .default('India'),
      }),
    otherwise: (schema) => schema.notRequired(),
  }),
});

export const DEFAULT_CUSTOMER_VALUES = {
  name: '',
  companyName: '',
  email: '',
  phone: '',
  gstin: '',
  currency: 'INR',
  status: 'Active',
  notes: '',
  website: '',
  paymentTerms: '',
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
