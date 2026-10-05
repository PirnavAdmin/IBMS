import { useState } from "react";
import { Alert, Button, Tab, Tabs } from "@mui/material";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { invoiceService } from "./services/invoiceService";
import { creditNoteService } from "../CreditNotes/services/creditNoteService";
import { InvoiceActions } from "./components/InvoiceActions";
import { InvoiceDocument } from "./components/InvoiceDocument";
import {
  InvoiceShell,
  InvoiceState,
  InvoiceStatus,
  InvoiceTotals,
  InvoiceValues,
  useInvoiceUser,
  identifier,
  date,
  money,
} from "./components/InvoiceShared";
export function InvoiceDetails() {
  const { id } = useParams();
  const location = useLocation();
  const [tab, setTab] = useState("Overview");
  const [page, setPage] = useState(1);
  const user = useInvoiceUser();
  const invoice = useQuery({
    queryKey: ["invoice", id],
    queryFn: ({ signal }) => invoiceService.get(id, { signal }),
    enabled: user.permissions.view,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const payments = useQuery({
    queryKey: ["invoice", "payments", id, page],
    queryFn: () => invoiceService.payments(id, page),
    enabled: tab === "Payments" && user.permissions.view,
    retry: false,
    staleTime: 0,
  });
  const credits = useQuery({
    queryKey: ["invoice", "credits", id, page],
    queryFn: () =>
      creditNoteService.list({ invoiceId: id, page, pageSize: 20 }),
    enabled: tab === "Credit Notes" && user.permissions.view,
    retry: false,
    staleTime: 0,
  });
  const audit = useQuery({
    queryKey: ["invoice-audit", id, page],
    queryFn: () => invoiceService.audit(id, page),
    enabled: tab === "Audit" && user.permissions.view,
    retry: false,
    staleTime: 0,
  });
  const row = invoice.data;
  const active =
    tab === "Payments" ? payments : tab === "Credit Notes" ? credits : audit;
  return (
    <InvoiceShell
      title={row ? identifier(row) : "Invoice Details"}
      subtitle={
        row?.customer?.name ||
        "Review the persisted invoice and its financial activity."
      }
      actions={
        <>
          <Button component={Link} to="/invoices">
            Back to invoices
          </Button>
          <Button
            disabled={invoice.isFetching || !user.permissions.view}
            onClick={() => {
              invoice.refetch();
              if (["Payments", "Credit Notes", "Audit"].includes(tab))
                active.refetch();
            }}
          >
            Refresh
          </Button>
          {row && (
            <InvoiceActions invoice={row} permissions={user.permissions} />
          )}
        </>
      }
    >
      {location.state?.invoiceNotice && (
        <Alert severity="success">{location.state.invoiceNotice}</Alert>
      )}
      <InvoiceState
        loading={user.isPending || invoice.isFetching}
        error={user.error || invoice.error}
        retry={() => {
          user.refetch();
          invoice.refetch();
        }}
      />
      {!user.isPending && !user.permissions.view && (
        <Alert severity="warning">
          Invoice access requires TenantAdmin or SuperAdmin.
        </Alert>
      )}
      {row && (
        <>
          <section className="invoice-panel invoice-details-summary">
            <InvoiceStatus status={row.status} />
            <InvoiceValues values={[["Invoice date", date(row.invoiceDate)], ["Currency", row.currency]]} />
            <div className="invoice-summary-grid invoice-detail-kpis">
              {[["Grand Total", money(row.totalAmount, row.currency)], ["Paid", money(row.paidAmount, row.currency)], ["Outstanding", money(row.balanceAmount, row.currency)], ["Due Date", date(row.dueDate)]].map(([label, value]) => <div className="invoice-summary-card" key={label}><span>{label}</span><strong>{value}</strong><small>{label === "Due Date" ? "Payment due date" : row.currency}</small></div>)}
            </div>
          </section>
          <Tabs
            value={tab}
            onChange={(_, value) => {
              setTab(value);
              setPage(1);
            }}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Invoice details tabs"
          >
            {[
              "Overview",
              "Items",
              "Payments",
              "Credit Notes",
              "Communication",
              "Audit",
            ].map((label) => (
              <Tab key={label} label={label} value={label} />
            ))}
          </Tabs>
          <section className="invoice-panel invoice-tab-content">
            {tab === "Overview" && <InvoiceDocument invoice={row} />}
            {tab === "Items" && (
              <>
                <h2>Persisted line items</h2>
                <p>Rates and amounts below are the saved invoice values.</p>
                <div className="invoice-table-scroll">
                  <table className="invoice-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>HSN/SAC</th>
                        <th className="numeric">Quantity</th>
                        <th className="numeric">Rate</th>
                        <th className="numeric">Discount</th>
                        <th>Tax</th>
                        <th className="numeric">Tax amount</th>
                        <th className="numeric">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.items?.map((item) => (
                        <tr key={item.id}>
                          <td>{item.description}</td>
                          <td>{item.hsnsac || "\u2014"}</td>
                          <td className="numeric">{item.quantity}</td>
                          <td className="numeric">
                            {money(item.unitPrice, row.currency)}
                          </td>
                          <td className="numeric">
                            {money(item.discountAmount, row.currency)}
                          </td>
                          <td>
                            {item.taxType || "\u2014"}{" "}
                            {item.taxRate == null ? "" : `${item.taxRate}%`}
                          </td>
                          <td className="numeric">
                            {money(item.taxAmount, row.currency)}
                          </td>
                          <td className="numeric">
                            {money(item.totalAmount, row.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <InvoiceTotals invoice={row} />
              </>
            )}
            {["Payments", "Credit Notes", "Audit"].includes(tab) && (
              <>
                <InvoiceState
                  loading={active.isFetching}
                  error={active.error}
                  retry={() => active.refetch()}
                />
                {tab === "Audit" && (
                  <Alert severity="info">
                    The server supports tenant Invoice audit pages, without an
                    invoice-ID filter. Only matching entries on this page are
                    shown; browse pages for older activity.
                  </Alert>
                )}
                {!active.error && active.data && (
                  <>
                    <div className="invoice-table-scroll">
                      <table className="invoice-table">
                        <thead>
                          <tr>
                            {(tab === "Payments"
                              ? [
                                  "Payment Number",
                                  "Date",
                                  "Amount",
                                  "Method",
                                  "Reference",
                                  "Status",
                                ]
                              : tab === "Credit Notes"
                                ? [
                                    "Credit Note Number",
                                    "Date",
                                    "Reason",
                                    "Amount",
                                    "Status",
                                  ]
                                : ["Action", "User", "Date/Time", "Details"]
                            ).map((label) => (
                              <th key={label}>{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {active.data.items.map((entry) =>
                            tab === "Payments" ? (
                              <tr key={entry.id}>
                                <td>
                                  <Link to={`/payments/${entry.id}`}>
                                    {entry.paymentNumber}
                                  </Link>
                                </td>
                                <td>{date(entry.paymentDate)}</td>
                                <td className="numeric">
                                  {money(entry.amount, entry.currency)}
                                </td>
                                <td>{entry.methodDisplay}</td>
                                <td>{entry.reference || "\u2014"}</td>
                                <td>{entry.status}</td>
                              </tr>
                            ) : tab === "Credit Notes" ? (
                              <tr key={entry.id}>
                                <td>
                                  <Link to={`/credit-notes/${entry.id}`}>
                                    {entry.number}
                                  </Link>
                                </td>
                                <td>{date(entry.date)}</td>
                                <td>{entry.reason}</td>
                                <td className="numeric">
                                  {money(
                                    entry.totalAmount ?? entry.total,
                                    entry.currency || row.currency,
                                  )}
                                </td>
                                <td>{entry.status}</td>
                              </tr>
                            ) : (
                              <tr key={entry.id}>
                                <td>{entry.action}</td>
                                <td>{entry.userName}</td>
                                <td>{entry.timestamp}</td>
                                <td className="invoice-preserve-text">
                                  {entry.changes}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                    {!active.data.items.length && (
                      <p>No matching activity on this page.</p>
                    )}
                    <div className="invoice-pagination">
                      <span>Page {page}</span>
                      <Button
                        disabled={page === 1 || active.isFetching}
                        onClick={() => setPage((previous) => previous - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        disabled={
                          page >= active.data.totalPages || active.isFetching
                        }
                        onClick={() => setPage((previous) => previous + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
            {tab === "Communication" && (
              <Alert severity="info">
                Invoice sending and communication history are unavailable on the
                current billing server. No email will be sent from this screen.
              </Alert>
            )}
          </section>
        </>
      )}
    </InvoiceShell>
  );
}
