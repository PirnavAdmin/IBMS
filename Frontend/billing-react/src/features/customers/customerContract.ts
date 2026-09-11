import type { Customer, CustomerQueryParams, CustomerWriteRequest, PaginatedCustomerResponse } from './types';
import { safeCustomerMessage } from '../../../../billing-contracts/customer.contracts.js';

export const customerCapabilities = {
  search: true, customerType: true, taxId: true, taxRegistration: true, outstanding: true, sorting: true,
} as const;

const object = (value: unknown): Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';
const amount = (value: unknown): number | null => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export function unwrapCustomerResponse(response: unknown): Record<string, any> {
  const envelope = object(response);
  if (envelope.success === false || envelope.isSuccess === false) throw new Error(safeCustomerMessage(envelope.message) || 'The customer request was rejected.');
  return Object.keys(object(envelope.data)).length ? object(envelope.data) : envelope;
}

export function customerQuery(params: CustomerQueryParams) {
  if (!Number.isInteger(params.page) || params.page < 1 || ![10, 25, 50, 100].includes(params.pageSize)) throw new Error('Invalid customer page or page size.');
  if (params.status && !['active', 'inactive'].includes(params.status)) throw new Error('Invalid customer status filter.');
  if (params.customerType && !['Business', 'Individual'].includes(params.customerType)) throw new Error('Invalid customer type filter.');
  if (params.taxRegistration && !['Registered', 'Unregistered'].includes(params.taxRegistration)) throw new Error('Invalid tax registration filter.');
  if (params.outstanding && !['Has Outstanding', 'No Outstanding'].includes(params.outstanding)) throw new Error('Invalid outstanding filter.');
  const sortBy = params.sortBy === 'customerCode' ? 'code' : params.sortBy;
  if (sortBy && !['createdAt', 'name', 'email', 'companyName', 'code', 'updatedAt'].includes(sortBy)) throw new Error('Invalid customer sort field. Reset filters to load customers.');
  if (params.sortOrder && !['asc', 'desc'].includes(params.sortOrder)) throw new Error('Invalid customer sort direction.');
  return {
    pageNumber: params.page, pageSize: params.pageSize,
    status: params.status === 'active' ? 'Active' : params.status === 'inactive' ? 'Inactive' : 'All',
    ...(params.search?.trim() ? { search: params.search.trim() } : {}),
    ...(params.customerType ? { customerType: params.customerType } : {}),
    ...(params.taxId?.trim() ? { taxId: params.taxId.trim() } : {}),
    ...(params.taxRegistration ? { taxRegistration: params.taxRegistration } : {}),
    ...(params.outstanding ? { outstanding: params.outstanding } : {}),
    ...(sortBy ? { sortBy, sortOrder: params.sortOrder || 'desc' } : {}),
  };
}

/** Swagger omits response schemas. These defensive mappings require authenticated verification. */
export function mapCustomer(response: unknown): Customer {
  const data = unwrapCustomerResponse(response);
  const row = Object.keys(object(data.customer)).length ? object(data.customer) : Object.keys(object(data.profile)).length ? object(data.profile) : data;
  const id = row.id ?? row.customerId;
  if (id === undefined || id === null || !/^\d+$/.test(String(id)) || Number(id) < 1) throw new Error('Customer API response is missing a valid numeric id/customerId. Confirm the backend response contract.');
  const tax = string(row.taxId);
  const gst = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(tax);
  const status = string(row.status).toLowerCase();
  return {
    id: String(id), customerCode: string(row.customerCode), name: string(row.name), companyName: string(row.companyName),
    email: string(row.email), mobile: string(row.phone), taxId: gst ? '' : tax, gstin: gst ? tax : '',
    customerType: ['individual', 'business', 'organization'].includes(string(row.customerType).toLowerCase()) ? row.customerType.toLowerCase() : '',
    currency: string(row.currency ?? object(data.financialSummary).currency), outstandingBalance: amount(object(data.financialSummary).outstandingBalance ?? row.outstandingBalance),
    creditLimit: amount(row.creditLimit), paymentTerms: string(row.paymentTerms),
    status: typeof row.isActive === 'boolean' ? row.isActive ? 'active' : 'inactive' : status === 'active' || status === 'inactive' ? status : 'unknown',
    createdAt: string(row.createdAt), notes: string(row.notes), backend: { ...row, ...(Array.isArray(data.addresses) ? { addresses: data.addresses } : {}) },
  };
}

export function mapCustomerPage(response: unknown, params: CustomerQueryParams): PaginatedCustomerResponse {
  const data = unwrapCustomerResponse(response);
  if (!Array.isArray(data.items) || !Number.isInteger(data.totalCount) || data.totalCount < 0) {
    throw new Error('Customer API must return items and totalCount (optionally inside data). Its Swagger does not define a response schema; confirm the authenticated response.');
  }
  const page = data.pageNumber ?? params.page;
  const pageSize = data.pageSize ?? params.pageSize;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1) throw new Error('Customer API returned invalid pagination metadata.');
  return { items: data.items.map(mapCustomer), page, pageSize, totalCount: data.totalCount, totalPages: Math.max(1, Math.ceil(data.totalCount / pageSize)) };
}

const preserved = ['customerCode', 'address', 'city', 'state', 'postalCode', 'country', 'website', 'addresses', 'rowVersion', 'status', 'isActive'] as const;
export function customerPayload(values: Partial<Customer>, existing?: Customer): CustomerWriteRequest {
  if (values.gstin && values.taxId && values.gstin !== values.taxId) throw new Error('The backend supports one Tax ID. Enter either GSTIN or PAN / Registration ID, not both.');
  const payload: Record<string, unknown> = {};
  if (existing) preserved.forEach(key => { if (existing.backend[key] !== undefined) payload[key] = existing.backend[key]; });
  for (const key of ['name', 'companyName', 'email', 'notes', 'currency', 'paymentTerms'] as const) {
    const value = values[key] ?? existing?.[key];
    if (value !== undefined) payload[key] = value;
  }
  if (values.mobile !== undefined) payload.phone = values.mobile;
  else if (existing) payload.phone = existing.mobile;
  if (values.gstin !== undefined || values.taxId !== undefined) payload.taxId = values.gstin || values.taxId || null;
  else if (existing) payload.taxId = existing.gstin || existing.taxId || null;
  return payload as CustomerWriteRequest;
}
