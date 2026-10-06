import { useEffect, useState } from "react";
import { Alert, Breadcrumbs, Button, LinearProgress } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiClient } from "billing-api-client";
import { invoiceError, invoicePermissions } from "../services/invoiceService";
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
  return { ...query, permissions: invoicePermissions(query.data) };
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
  const rows = calculation
    ? [
        ["Subtotal", calculation.grossSubtotal],
        ["Item discount", calculation.totalLineDiscounts],
        ["Invoice discount", calculation.invoiceDiscountAmount],
        ["Taxable amount", calculation.taxableSubtotal],
        ["Tax", calculation.totalTaxes],
        ["Charges", calculation.chargesTotal],
        ["Tax on charges", calculation.taxOnChargesTotal],
        ["Grand total (before invoice rounding)", calculation.grandTotal],
      ]
    : [
        ["Subtotal", invoice?.subtotal],
        ["Discount", invoice?.discountAmount],
        ["Tax", invoice?.taxAmount],
        ["Charges", invoice?.chargesAmount],
        ["Rounding", invoice?.roundingAmount],
        ["Grand total", invoice?.totalAmount],
        ["Paid", invoice?.paidAmount],
        ["Credits", invoice?.creditedAmount],
        ["Outstanding", invoice?.balanceAmount],
      ];
  return (
    <section className="invoice-total-panel">
      <h2>{calculation ? "Calculation preview" : "Persisted totals"}</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{money(value, currency || invoice?.currency)}</dd>
          </div>
        ))}
      </dl>
      {calculation?.appliedTaxes?.length > 0 && (
        <div className="invoice-tax-breakdown">
          {calculation.appliedTaxes.map((tax, index) => (
            <p key={index}>
              {tax.taxName} ({tax.rate}%){" "}
              <strong>{money(tax.taxAmount, currency)}</strong>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
