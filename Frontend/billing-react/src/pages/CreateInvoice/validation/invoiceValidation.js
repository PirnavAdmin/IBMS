import * as yup from 'yup';

export const invoiceValidationSchema = yup.object().shape({
  customerId: yup
    .string()
    .trim()
    .required('Please select an active customer.'),
  customerName: yup
    .string()
    .trim()
    .required('Customer name is required.'),
  customerEmail: yup
    .string()
    .trim()
    .email('Enter a valid email address.')
    .nullable(),
  customerPhone: yup.string().trim().nullable(),
  customerGstin: yup.string().trim().nullable(),
  billingAddress: yup.string().trim().nullable(),

  invoiceNumber: yup
    .string()
    .trim()
    .required('Invoice number is required.')
    .max(64, 'Invoice number cannot exceed 64 characters.'),
  invoiceDate: yup
    .string()
    .required('Invoice date is required.'),
  dueDate: yup
    .string()
    .required('Due date is required.')
    .test('due-after-invoice', 'Due date cannot precede the invoice date.', function (val) {
      const { invoiceDate } = this.parent;
      if (!val || !invoiceDate) return true;
      return new Date(val) >= new Date(invoiceDate);
    }),
  currency: yup
    .string()
    .default('INR'),
  paymentTerms: yup
    .string()
    .default('Net 30'),
  poNumber: yup
    .string()
    .trim()
    .max(64, 'PO number cannot exceed 64 characters.')
    .nullable(),
  reference: yup
    .string()
    .trim()
    .max(64, 'Reference cannot exceed 64 characters.')
    .nullable(),
  notes: yup
    .string()
    .trim()
    .max(1000, 'Notes cannot exceed 1000 characters.')
    .nullable(),
  termsAndConditions: yup
    .string()
    .trim()
    .max(2000, 'Terms and conditions cannot exceed 2000 characters.')
    .nullable(),

  items: yup
    .array()
    .of(
      yup.object().shape({
        productId: yup.string().nullable(),
        description: yup
          .string()
          .trim()
          .required('Item description is required.')
          .max(500, 'Description cannot exceed 500 characters.'),
        hsnSac: yup
          .string()
          .trim()
          .nullable(),
        unit: yup
          .string()
          .trim()
          .default('Piece'),
        quantity: yup
          .number()
          .transform((value, original) => (original === '' ? undefined : value))
          .typeError('Quantity must be a valid number.')
          .positive('Quantity must be greater than 0.')
          .max(999999, 'Quantity exceeds maximum allowed.')
          .required('Quantity is required.'),
        unitPrice: yup
          .number()
          .transform((value, original) => (original === '' ? undefined : value))
          .typeError('Unit price must be a valid number.')
          .min(0, 'Price cannot be negative.')
          .max(999999999, 'Unit price exceeds limit.')
          .required('Unit price is required.'),
        discountType: yup
          .string()
          .oneOf(['percentage', 'fixed'])
          .default('percentage'),
        discountValue: yup
          .number()
          .transform((value, original) => (original === '' ? 0 : value))
          .min(0, 'Discount cannot be negative.')
          .default(0),
        taxPercent: yup
          .number()
          .transform((value, original) => (original === '' ? 0 : value))
          .min(0, 'Tax percentage cannot be negative.')
          .default(18),
      })
    )
    .min(1, 'Invoice must contain at least one line item.')
    .required('At least one item is required.'),

  invoiceDiscountType: yup
    .string()
    .oneOf(['percentage', 'fixed'])
    .default('percentage'),
  invoiceDiscountValue: yup
    .number()
    .transform((value, original) => (original === '' ? 0 : value))
    .min(0, 'Invoice discount cannot be negative.')
    .default(0),
  shippingFee: yup
    .number()
    .transform((value, original) => (original === '' ? 0 : value))
    .min(0, 'Shipping fee cannot be negative.')
    .default(0),
});

export const DEFAULT_INVOICE_ITEM = {
  id: '',
  productId: '',
  description: '',
  hsnSac: '',
  unit: 'Piece',
  quantity: 1,
  unitPrice: 0,
  discountType: 'percentage',
  discountValue: 0,
  taxPercent: 18,
};

export const DEFAULT_INVOICE_VALUES = {
  customerId: '',
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  customerGstin: '',
  billingAddress: '',
  invoiceNumber: '',
  invoiceDate: new Date().toISOString().slice(0, 10),
  dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  currency: 'INR',
  paymentTerms: 'Net 30',
  poNumber: '',
  reference: '',
  notes: 'Thank you for your business! Please make payment within terms.',
  termsAndConditions: '1. Invoices not paid by due date may incur standard service charges.\n2. Discrepancies must be notified within 7 days.',
  items: [{ ...DEFAULT_INVOICE_ITEM, id: 'item-1' }],
  invoiceDiscountType: 'percentage',
  invoiceDiscountValue: 0,
  shippingFee: 0,
};
