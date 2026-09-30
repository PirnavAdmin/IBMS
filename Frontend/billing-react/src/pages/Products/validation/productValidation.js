import * as yup from 'yup';

const CODE_REGEX = /^[A-Za-z0-9_-]{2,64}$/;
const HSN_SAC_REGEX = /^[0-9]{4,8}$/;

export const PRODUCT_TYPES = ['Product', 'Service','E-Commerce',];
export const CURRENCIES = ['INR', 'USD', 'EUR'];
export const TAX_CATEGORIES = ['GST 18%', 'GST 12%', 'GST 28%', 'GST 5%', 'GST 0%', 'Exempt'];
export const STANDARD_UNITS = ['Piece', 'Set', 'Others'];

export const productValidationSchema = yup.object({
  // 1. Product Information
  productCode: yup
    .string()
    .trim()
    .transform((value) => value === '' ? undefined : value)
    .optional()
    .min(2, 'Product code must be at least 2 characters')
    .max(64, 'Product code must not exceed 64 characters')
    .matches(CODE_REGEX, 'Product code must contain only letters, numbers, hyphens, and underscores'),

  name: yup
    .string()
    .trim()
    .required('Product name is required')
    .min(2, 'Product name must be at least 2 characters')
    .max(256, 'Product name must not exceed 256 characters'),

  type: yup
    .string()
    .oneOf(PRODUCT_TYPES, 'Select a valid product type')
    .default('Product'),

  categoryId: yup
    .string()
    .trim()
    .required('Category is required')
    .matches(/^[1-9][0-9]*$/, 'Select a valid category'),

  description: yup
    .string()
    .trim()
    .max(1000, 'Description must not exceed 1000 characters')
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),

  // 2. Pricing & Tax
  unit: yup
    .string()
    .trim()
    .required('Unit is required')
    .max(32, 'Unit must not exceed 32 characters')
    .default('Piece'),

  price: yup
    .number()
    .typeError('Price must be a valid number')
    .required('Price is required')
    .min(0, 'Price cannot be negative')
    .max(999999999.99, 'Price must not exceed 999999999.99'),

  currency: yup
    .string()
    .oneOf(CURRENCIES, 'Select a valid currency')
    .default('INR'),

  taxCategory: yup
    .string()
    .oneOf(['', ...TAX_CATEGORIES], 'Select a valid tax category')
    .default('GST 18%'),

  hsnSac: yup
    .string()
    .when('type', {
      is: 'Product',
      then: schema => schema.matches(/^[0-9]{8}$/, { message: 'HSN code must contain exactly 8 digits.', excludeEmptyString: true }),
      otherwise: schema => schema.when('type', {
        is: 'Service',
        then: serviceSchema => serviceSchema.matches(/^[0-9]{6}$/, { message: 'SAC code must contain exactly 6 digits.', excludeEmptyString: true }),
        // Preserve the existing rule for the other supported product type.
        otherwise: otherSchema => otherSchema.trim().max(16, 'HSN/SAC must not exceed 16 characters')
          .matches(HSN_SAC_REGEX, { message: 'HSN/SAC must be 4 to 8 digits', excludeEmptyString: true }),
      }),
    })
    .nullable()
    .transform((curr, orig) => (orig === '' ? null : curr)),

  discountPercentage: yup.number().when('discountAllowed', {
    is: true,
    then: schema => schema
      .transform((value, original) => typeof original === 'string' && original.trim() === '' ? undefined : value)
      .typeError('Discount must be a valid number')
      .required('Discount is required (enter 0 for no discount)')
      .min(0, 'Discount must be between 0 and 100%')
      .max(100, 'Discount must be between 0 and 100%'),
    otherwise: schema => schema.transform(() => 0).default(0),
  }),

  // 3. Settings
  discountAllowed: yup
    .boolean()
    .default(false),

  status: yup
    .string()
    .oneOf(['Active', 'Inactive'], 'Select a valid status')
    .default('Active'),
});

export const DEFAULT_PRODUCT_VALUES = {
  productCode: '',
  name: '',
  type: 'Product',
  categoryId: '',
  description: '',
  unit: 'Piece',
  price: '',
  currency: 'INR',
  taxCategory: 'GST 18%',
  hsnSac: '',
  discountPercentage: '',
  discountAllowed: false,
  status: 'Active',
};
