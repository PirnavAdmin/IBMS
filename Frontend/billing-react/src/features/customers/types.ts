export interface Customer {
  id: string; customerCode: string; customerType: 'individual' | 'business' | 'organization' | '';
  name: string; companyName: string; email: string; mobile: string; taxId: string; gstin: string;
  currency: string; outstandingBalance: number | null; creditLimit: number | null; paymentTerms: string;
  status: 'active' | 'inactive' | 'unknown'; createdAt: string; notes: string;
  backend: Record<string, unknown>;
}
export interface CustomerQueryParams {
  page: number; pageSize: number; search?: string; status?: string; customerType?: string;
  taxId?: string; taxRegistration?: string; outstanding?: string; sortBy?: string; sortOrder?: 'asc' | 'desc';
}
export interface PaginatedCustomerResponse {
  items: Customer[]; page: number; pageSize: number; totalCount: number; totalPages: number;
}
export interface CustomerSummary {
  total: number; active: number; inactive: number; outstanding: number | null; currency: string;
}
/** Live Swagger DTO fields; unsupported UI fields must not be sent. */
export interface CustomerWriteRequest {
  customerCode?: string | null; name?: string | null; email?: string | null; phone?: string | null;
  companyName?: string | null; taxId?: string | null; address?: string | null; city?: string | null;
  state?: string | null; postalCode?: string | null; country?: string | null; website?: string | null;
  notes?: string | null; currency?: string | null; paymentTerms?: string | null; addresses?: unknown[] | null;
  status?: string | null; isActive?: boolean | null; rowVersion?: string | null;
}
