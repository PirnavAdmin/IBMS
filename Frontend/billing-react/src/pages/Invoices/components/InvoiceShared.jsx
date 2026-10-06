import { useEffect, useState } from "react";
import { Alert, Breadcrumbs, Button, LinearProgress } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiClient } from "billing-api-client";
import {
  invoiceError,
  invoicePermissions,
  resolveCurrentUser,
} from "../services/invoiceService";
import "../styles/invoices.css";
export function useDebounced(value, wait = 275) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), wait);
    return () => clearTimeout(timer);
  }, [value, wait]);
  return debounced;
}
export function useInvoiceUser() {
  const query = useQuery({
    queryKey: ["auth-user"],
    queryFn: () => apiClient.get("/api/Auth/me"),
    retry: false,
    staleTime: 60000,
  });
  const resolved = resolveCurrentUser(query.data);
  return {
    ...query,
    data: resolved || query.data,
    permissions: invoicePermissions(query.data || resolved),
  };
}
export const money = (amount, currency) =>
  amount == null || !Number.isFinite(Number(amount)) || !currency
    ? "\u2014"
    : (() => {
        try {
          return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
          }).format(amount);
        } catch {
          return `${currency} ${amount}`;
        }
      })();
export const date = (value) => (value ? value.slice(0, 10) : "\u2014");
export const identifier = (invoice) =>
  invoice.invoiceNumber || `Draft #${invoice.id}`;
export function InvoiceShell({ title, subtitle, actions, children }) {
  return (
    <main className="invoice-page">
      <Breadcrumbs aria-label="Breadcrumb">
        <Link to="/dashboard">Home</Link>
        {title === "Invoices" ? (
          <span>Invoices</span>
        ) : (
          <>
            <Link to="/invoices">Invoices</Link>
            <span>{title}</span>
          </>
        )}
      </Breadcrumbs>
      <header className="invoice-heading">
        <div>
          <span className="invoice-eyebrow">Billing workspace</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="invoice-actions">{actions}</div>
      </header>
      {children}
    </main>
  );
}
export function InvoiceState({ loading, error, empty, retry }) {
  return (
    <>
      {loading && !error && (
        <div className="invoice-loading" role="status">
          <LinearProgress />
          <p>Loading invoice data...</p>
        </div>
      )}
      {error && (
        <Alert
          severity="error"
          action={retry && <Button onClick={retry}>Retry</Button>}
        >
          {invoiceError(error)}
        </Alert>
      )}
      {!loading && !error && empty && (
        <div className="invoice-empty">{empty}</div>
      )}
    </>
  );
}
export function InvoiceStatus({ status }) {
  return (
    <span className="invoice-status" data-status={status}>
      <span className="invoice-status-dot" aria-hidden="true" />
      {status}
    </span>
  );
}
export function InvoiceValues({ values }) {
  return (
    <dl className="invoice-values">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value == null || value === "" ? "\u2014" : value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function InvoiceTotals({ invoice, calculation, currency }) {
  const isCalc = Boolean(calculation);
  const activeCurrency = currency || invoice?.currency || "INR";
  
  const baseRows = isCalc
    ? [
        ["Subtotal", calculation.grossSubtotal],
        ["Discount", (Number(calculation.totalLineDiscounts) || 0) + (Number(calculation.invoiceDiscountAmount) || 0)],
        ["Taxable Base", calculation.taxableSubtotal],
        ["Tax", calculation.totalTaxes],
        ["Additional Charges", (Number(calculation.chargesTotal) || 0) + (Number(calculation.taxOnChargesTotal) || 0)],
        ["Rounding", calculation.roundingAdjustment || 0],
      ]
    : [
        ["Subtotal", invoice?.subtotal],
        ["Discount", invoice?.discountAmount],
        ["Taxable Base", invoice?.taxableAmount != null ? invoice.taxableAmount : (invoice?.subtotal - (invoice?.discountAmount || 0))],
        ["Tax", invoice?.taxAmount],
        ["Additional Charges", invoice?.chargesAmount],
        ["Rounding", invoice?.roundingAmount || 0],
      ];

  const grandTotal = isCalc ? calculation.grandTotal : invoice?.totalAmount;

  return (
    <section className="invoice-total-panel">
      <div className="invoice-total-header">
        <h2>Financial Summary</h2>
        <span className="invoice-preview-tag">
          {isCalc ? "Authoritative Preview" : "Persisted"}
        </span>
      </div>
      <dl className="invoice-summary-list">
        {baseRows.map(([label, value]) => (
          <div key={label} className="invoice-summary-row">
            <dt>{label}</dt>
            <dd>{money(value, activeCurrency)}</dd>
          </div>
        ))}
      </dl>

      <div className="invoice-grand-total-row">
        <span>Grand Total</span>
        <strong>{money(grandTotal, activeCurrency)}</strong>
      </div>

      {!isCalc && invoice && (invoice.paidAmount != null || invoice.balanceAmount != null) && (
        <div className="invoice-post-issue-balances">
          <div className="invoice-summary-row">
            <span>Paid</span>
            <strong>{money(invoice.paidAmount || 0, activeCurrency)}</strong>
          </div>
          <div className="invoice-summary-row">
            <span>Credits</span>
            <strong>{money(invoice.creditedAmount || 0, activeCurrency)}</strong>
          </div>
          <div className="invoice-summary-row invoice-balance-row">
            <span>Outstanding</span>
            <strong>{money(invoice.balanceAmount || 0, activeCurrency)}</strong>
          </div>
        </div>
      )}

      {calculation?.appliedTaxes?.length > 0 && (
        <div className="invoice-tax-breakdown">
          <span className="invoice-tax-breakdown-title">Tax Breakdown</span>
          {calculation.appliedTaxes.map((tax, index) => (
            <div key={index} className="invoice-tax-breakdown-row">
              <span>{tax.taxName} ({tax.rate}%)</span>
              <strong>{money(tax.taxAmount, activeCurrency)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
