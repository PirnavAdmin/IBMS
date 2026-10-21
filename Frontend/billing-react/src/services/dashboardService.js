import { invoiceService } from '../pages/Invoices/services/invoiceService';
import { paymentService } from '../pages/Payments/paymentService';
import { collectPages, validateBillingRecords } from '../pages/Dashboard/dashboardModel';
export const getDashboardInvoices = async (filters, signal) => validateBillingRecords(await collectPages(page => invoiceService.list({ startDate: filters.start, endDate: filters.end, page, pageSize: 100 }, { signal }), signal), 'invoices');
export const getDashboardPayments = async (filters, signal) => validateBillingRecords(await collectPages(pageNumber => paymentService.getPayments({ from: filters.start ? `${filters.start}T00:00:00Z` : '', to: filters.end ? `${filters.end}T23:59:59.999Z` : '', pageNumber, pageSize: 100, sortBy: 'paymentDate', sortOrder: 'desc' }, { signal }), signal), 'payments');
