import { renderToStaticMarkup } from 'react-dom/server';
import { CustomerPrintSheet } from '../components/CustomerPrintSheet';
import { formatCurrency } from '../components/CustomerShared';
import { printDocument, reportDocument, reportTable } from '../../../utils/printDocument';

export function buildCustomerListReport(customers) {
  return reportDocument('Customers', reportTable(
    ['Customer Code', 'Customer', 'Company', 'Type', 'Tax ID', 'Email', 'Phone', 'Outstanding', 'Status'],
    customers.map(c=>[c.customerCode, c.name, c.companyName, c.customerType, c.gstin || c.taxId,
      c.email, c.mobile || c.phone, formatCurrency(c.outstandingBalance,c.currency), c.status])
  ));
}

export function buildCustomerDetailsReport(record) {
  return reportDocument('Customer Details', renderToStaticMarkup(<CustomerPrintSheet record={record} />), `
    .customer-print-header{border-bottom:1px solid #BBA58C;padding-bottom:12px}
    .customer-print-header h1{font-size:17px;margin-top:12px}
    .customer-print-meta{display:flex;flex-wrap:wrap;gap:20px}
    .customer-print-status{font-weight:bold}
    .customer-print-section{margin-top:18px}
    .customer-print-section h2{break-after:avoid}
    .customer-print-grid,.customer-print-summary,.customer-print-addresses{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0}
    .customer-print-grid>div,.customer-print-summary>div,.customer-print-addresses>div{border:1px solid #BBA58C;padding:8px;break-inside:avoid;overflow-wrap:anywhere}
    dt,.customer-print-summary span{display:block;color:#4B2E1E;background:#F0E2D0;padding:4px;margin-bottom:6px}
    dd{margin:0}h3{font-size:13px;color:#633D28}
    .customer-print-footer{margin-top:16px;font-size:10px}
  `, false);
}
export const printCustomerList = customers => printDocument(buildCustomerListReport(customers));
export const printCustomerDetails = record => printDocument(buildCustomerDetailsReport(record));
