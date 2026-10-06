import { useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tab,
  Tabs,
  Tooltip,
} from "@mui/material";
import {
  CheckCircleOutline,
  ContentCopyOutlined,
  DescriptionOutlined,
  EditOutlined,
  EmailOutlined,
  HistoryOutlined,
  PaymentOutlined,
  PersonOutline,
  PictureAsPdfOutlined,
  ReceiptLongOutlined,
  ReceiptOutlined,
  Refresh,
  SendOutlined,
} from "@mui/icons-material";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  invoiceService,
  invoiceError,
  invalidateInvoices,
} from "./services/invoiceService";
import { creditNoteService } from "../CreditNotes/services/creditNoteService";
import { InvoiceActions } from "./components/InvoiceActions";
import {
  InvoiceShell,
  InvoiceState,
  InvoiceStatus,
  InvoiceTotals,
  useInvoiceUser,
  identifier,
  date,
  money,
} from "./components/InvoiceShared";

export function InvoiceDetails() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [tab, setTab] = useState("Overview");
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState("");
  const [notice, setNotice] = useState("");
  const user = useInvoiceUser();

  const invoice = useQuery({
    queryKey: ["invoice", id],
    queryFn: ({ signal }) => invoiceService.get(id, { signal }),
    enabled: user.permissions.view,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const row = invoice.data;

  const customer = useQuery({
    queryKey: ["customer", row?.customerId],
    queryFn: () => invoiceService.customer(row.customerId),
    enabled: Boolean(row?.customerId) && user.permissions.view,
    retry: false,
    staleTime: 60000,
  });

  const customerData =
    row?.customer?.name ? row.customer : customer.data || row?.customer;

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

  const canEdit = row?.status === "Draft" && user.permissions.manage;
  const canIssue = row?.status === "Draft" && user.permissions.manage;
  const canRecordPayment =
    ["Issued", "Sent", "Overdue", "Partially Paid"].includes(row?.status) &&
    Number(row?.balanceAmount) > 0 &&
    user.permissions.manage;
  const canCreateCredit =
    ["Issued", "Sent", "Overdue", "Partially Paid", "Paid"].includes(
      row?.status,
    ) &&
    Number(row?.totalAmount) > 0 &&
    Number(row?.creditedAmount || 0) < Number(row?.totalAmount) &&
    user.permissions.manage;
  const canDownloadPdf = row?.status !== "Draft";

  const handleCopyEmail = (email) => {
    if (!email) return;
    navigator.clipboard?.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <InvoiceShell
      title={row ? identifier(row) : "Invoice Details"}
      subtitle={
        customerData?.name ||
        "Review the authoritative invoice record and financial lifecycle."
      }
      actions={
        <>
          <Button component={Link} to="/invoices">
            Back to invoices
          </Button>
          <Button
            startIcon={<Refresh />}
            disabled={invoice.isFetching || !user.permissions.view}
            onClick={() => {
              invoice.refetch();
              if (tab === "Payments") payments.refetch();
              if (tab === "Credit Notes") credits.refetch();
              if (tab === "Audit") audit.refetch();
            }}
          >
            Refresh
          </Button>

          {canRecordPayment && (
            <Button
              variant="contained"
              startIcon={<PaymentOutlined />}
              onClick={() =>
                navigate("/payments/new", { state: { invoiceId: row.id } })
              }
            >
              Record Payment
            </Button>
          )}

          {canEdit && (
            <Button
              variant="contained"
              startIcon={<EditOutlined />}
              component={Link}
              to={`/invoices/${row.id}/edit`}
            >
              Edit Draft
            </Button>
          )}

          {canDownloadPdf && !canRecordPayment && (
            <Button
              variant="outlined"
              startIcon={<PictureAsPdfOutlined />}
              onClick={() => invoiceService.downloadPdf(row)}
            >
              Download PDF
            </Button>
          )}

          {row && (
            <InvoiceActions invoice={row} permissions={user.permissions} />
          )}
        </>
      }
    >
      {notice && (
        <Alert severity="success" onClose={() => setNotice("")} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}
      {location.state?.invoiceNotice && !notice && (
        <Alert severity="success">{location.state.invoiceNotice}</Alert>
      )}

      <InvoiceState
        loading={invoice.isFetching}
        error={invoice.error}
        retry={() => invoice.refetch()}
      />

      {!user.isPending && !user.permissions.view && (
        <Alert severity="warning">
          Invoice access requires TenantAdmin or SuperAdmin.
        </Alert>
      )}

      {row && (
        <>
          {/* Executive KPI Summary Header */}
          <section className="invoice-panel invoice-details-summary">
            <div className="invoice-details-header-meta">
              <div className="invoice-meta-badge-group">
                <InvoiceStatus status={row.status} />
                <span className="invoice-meta-chip">
                  <strong>Currency:</strong> {row.currency}
                </span>
                <span className="invoice-meta-chip">
                  <strong>Issued:</strong> {date(row.invoiceDate)}
                </span>
                <span className="invoice-meta-chip">
                  <strong>Due:</strong> {date(row.dueDate)}
                </span>
                {row.reference && (
                  <span className="invoice-meta-chip">
                    <strong>Ref:</strong> {row.reference}
                  </span>
                )}
              </div>
            </div>

            <div className="invoice-summary-grid invoice-detail-kpis">
              <div className="invoice-summary-card invoice-tone-sand">
                <span>Grand Total</span>
                <strong>{money(row.totalAmount, row.currency)}</strong>
                <small>Total Invoiced ({row.currency})</small>
              </div>

              <div className="invoice-summary-card invoice-tone-mint">
                <span>Paid Amount</span>
                <strong>{money(row.paidAmount, row.currency)}</strong>
                <small>Settled by Payments</small>
              </div>

              <div
                className={`invoice-summary-card ${
                  Number(row.balanceAmount) > 0
                    ? row.status === "Overdue"
                      ? "invoice-tone-rose"
                      : "invoice-tone-amber"
                    : "invoice-tone-mint"
                }`}
              >
                <span>Outstanding Balance</span>
                <strong>{money(row.balanceAmount, row.currency)}</strong>
                <small>
                  {Number(row.balanceAmount) > 0
                    ? row.status === "Overdue"
                      ? "Overdue Payment Balance"
                      : "Awaiting Settlement"
                    : "Fully Settled"}
                </small>
              </div>

              <div className="invoice-summary-card invoice-tone-sand">
                <span>Payment Terms</span>
                <strong style={{ fontSize: "19px" }}>
                  {customerData?.paymentTerms || "Standard Terms"}
                </strong>
                <small>Due Date: {date(row.dueDate)}</small>
              </div>
            </div>
          </section>

          {/* Navigation Tabs */}
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

          {/* Tab 1: Overview */}
          {tab === "Overview" && (
            <section className="invoice-panel invoice-tab-content">
              <div className="invoice-overview-layout">
                <div className="invoice-overview-main-col">
                  {/* Customer Dossier Card */}
                  <div className="invoice-detail-card">
                    <div className="invoice-detail-card-header">
                      <div className="invoice-detail-card-title-group">
                        <PersonOutline className="invoice-detail-card-icon" />
                        <div>
                          <h3>Customer Details</h3>
                          <p>Commercial entity &amp; billing profile</p>
                        </div>
                      </div>
                      {customerData?.id && (
                        <Button
                          size="small"
                          component={Link}
                          to={`/customers/${customerData.id}`}
                          variant="text"
                          className="invoice-card-link-action"
                        >
                          View Customer
                        </Button>
                      )}
                    </div>
                    <div className="invoice-customer-dossier-grid">
                      <div className="invoice-dossier-field">
                        <span className="invoice-dossier-label">
                          Customer Name
                        </span>
                        <strong className="invoice-dossier-value">
                          {customerData?.name || "\u2014"}
                        </strong>
                      </div>
                      <div className="invoice-dossier-field">
                        <span className="invoice-dossier-label">
                          GSTIN / Tax ID
                        </span>
                        <span className="invoice-dossier-value">
                          {customerData?.taxId || customerData?.taxNumber ? (
                            <span className="invoice-mono-badge">
                              {customerData?.taxId || customerData?.taxNumber}
                            </span>
                          ) : (
                            "\u2014"
                          )}
                        </span>
                      </div>
                      <div className="invoice-dossier-field">
                        <span className="invoice-dossier-label">
                          Email Address
                        </span>
                        <span className="invoice-dossier-value">
                          {customerData?.email || "\u2014"}
                        </span>
                      </div>
                      <div className="invoice-dossier-field">
                        <span className="invoice-dossier-label">
                          Phone Number
                        </span>
                        <span className="invoice-dossier-value">
                          {customerData?.phone || "\u2014"}
                        </span>
                      </div>
                      <div className="invoice-dossier-field invoice-dossier-field-full">
                        <span className="invoice-dossier-label">
                          Billing Address
                        </span>
                        <span className="invoice-dossier-value">
                          {[
                            customerData?.address,
                            customerData?.city,
                            customerData?.state,
                            customerData?.postalCode,
                            customerData?.country,
                          ]
                            .filter(Boolean)
                            .join(", ") ||
                            "No address supplied by customer API."}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Commercial Terms & Invoice Details Card */}
                  <div className="invoice-detail-card">
                    <div className="invoice-detail-card-header">
                      <div className="invoice-detail-card-title-group">
                        <ReceiptOutlined className="invoice-detail-card-icon" />
                        <div>
                          <h3>Invoice Metadata</h3>
                          <p>Commercial dates &amp; reference details</p>
                        </div>
                      </div>
                    </div>
                    <div className="invoice-customer-dossier-grid">
                      <div className="invoice-dossier-field">
                        <span className="invoice-dossier-label">
                          Invoice Identifier
                        </span>
                        <strong className="invoice-dossier-value">
                          {identifier(row)}
                        </strong>
                      </div>
                      <div className="invoice-dossier-field">
                        <span className="invoice-dossier-label">Status</span>
                        <span className="invoice-dossier-value">
                          <InvoiceStatus status={row.status} />
                        </span>
                      </div>
                      <div className="invoice-dossier-field">
                        <span className="invoice-dossier-label">
                          Invoice Date
                        </span>
                        <span className="invoice-dossier-value">
                          {date(row.invoiceDate)}
                        </span>
                      </div>
                      <div className="invoice-dossier-field">
                        <span className="invoice-dossier-label">Due Date</span>
                        <span className="invoice-dossier-value">
                          {date(row.dueDate)}
                        </span>
                      </div>
                      <div className="invoice-dossier-field">
                        <span className="invoice-dossier-label">Currency</span>
                        <span className="invoice-dossier-value">
                          {row.currency}
                        </span>
                      </div>
                      <div className="invoice-dossier-field">
                        <span className="invoice-dossier-label">
                          Payment Terms
                        </span>
                        <span className="invoice-dossier-value">
                          {customerData?.paymentTerms || "Standard Terms"}
                        </span>
                      </div>
                      <div className="invoice-dossier-field invoice-dossier-field-full">
                        <span className="invoice-dossier-label">
                          Reference / PO Number
                        </span>
                        <span className="invoice-dossier-value">
                          {row.reference || "\u2014"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Notes & Terms Card */}
                  <div className="invoice-detail-card">
                    <div className="invoice-detail-card-header">
                      <div className="invoice-detail-card-title-group">
                        <DescriptionOutlined className="invoice-detail-card-icon" />
                        <div>
                          <h3>Commercial Notes &amp; Conditions</h3>
                          <p>Customer notes and payment conditions</p>
                        </div>
                      </div>
                    </div>
                    <div className="invoice-notes-terms-container">
                      <div className="invoice-notes-block">
                        <h4>Customer Notes</h4>
                        <p className="invoice-preserve-text">
                          {row.notes || "No notes entered for this invoice."}
                        </p>
                      </div>
                      <div className="invoice-terms-block">
                        <h4>Terms &amp; Conditions</h4>
                        <p className="invoice-preserve-text">
                          {row.termsAndConditions ||
                            "Standard corporate billing terms apply."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="invoice-overview-side-col">
                  {/* Authoritative Financial Breakdown Card */}
                  <div className="invoice-detail-card invoice-detail-financial-card">
                    <InvoiceTotals invoice={row} />
                  </div>

                  {/* Quick Action Shortcuts Card */}
                  <div className="invoice-detail-card invoice-quick-actions-card">
                    <h3>Quick Actions</h3>
                    <div className="invoice-quick-action-buttons">
                      {canRecordPayment && (
                        <Button
                          variant="contained"
                          fullWidth
                          startIcon={<PaymentOutlined />}
                          onClick={() =>
                            navigate("/payments/new", {
                              state: { invoiceId: row.id },
                            })
                          }
                        >
                          Record Payment
                        </Button>
                      )}
                      {canIssue && (
                        <Button
                          variant="contained"
                          fullWidth
                          startIcon={<SendOutlined />}
                          onClick={() => {
                            setIssueError("");
                            setIssueDialogOpen(true);
                          }}
                        >
                          Issue Invoice
                        </Button>
                      )}
                      {canDownloadPdf && (
                        <Button
                          variant="outlined"
                          fullWidth
                          startIcon={<PictureAsPdfOutlined />}
                          onClick={() => invoiceService.downloadPdf(row)}
                        >
                          Download PDF
                        </Button>
                      )}
                      {canCreateCredit && (
                        <Button
                          variant="outlined"
                          fullWidth
                          startIcon={<ReceiptLongOutlined />}
                          onClick={() =>
                            navigate("/credit-notes/new", {
                              state: { invoiceId: row.id },
                            })
                          }
                        >
                          Create Credit Note
                        </Button>
                      )}
                      <Button
                        variant="outlined"
                        fullWidth
                        startIcon={<DescriptionOutlined />}
                        component={Link}
                        to={`/invoices/${row.id}/preview`}
                      >
                        View Printable Invoice
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Tab 2: Items */}
          {tab === "Items" && (
            <section className="invoice-panel invoice-tab-content">
              <div className="invoice-items-tab-container">
                <div className="invoice-table-heading">
                  <div>
                    <h2>Persisted Line Items</h2>
                    <p>
                      Rates and amounts below reflect the authoritative saved
                      invoice values.
                    </p>
                  </div>
                  <span className="invoice-count-badge">
                    {row.items?.length || 0}{" "}
                    {row.items?.length === 1 ? "Line Item" : "Line Items"}
                  </span>
                </div>
                <div className="invoice-table-scroll">
                  <table className="invoice-table invoice-detail-items-table">
                    <thead>
                      <tr>
                        <th
                          style={{ width: "44px" }}
                          className="invoice-cell-center"
                        >
                          #
                        </th>
                        <th>Product / Description</th>
                        <th>HSN/SAC</th>
                        <th className="numeric">Quantity</th>
                        <th className="numeric">Rate</th>
                        <th className="numeric">Discount</th>
                        <th>Tax Rate</th>
                        <th className="numeric">Tax Amount</th>
                        <th className="numeric">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.items?.map((item, index) => {
                        const prodName =
                          item.productName || item.product?.name;
                        return (
                          <tr key={item.id || index}>
                            <td className="invoice-cell-center">
                              <span className="invoice-row-index">
                                {index + 1}
                              </span>
                            </td>
                            <td>
                              <div className="invoice-item-info">
                                {prodName ? (
                                  <>
                                    <strong className="invoice-item-name">
                                      {prodName}
                                    </strong>
                                    <span className="invoice-item-desc">
                                      {item.description}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <strong className="invoice-item-name">
                                      {item.description}
                                    </strong>
                                    {item.productId && (
                                      <span className="invoice-item-code">
                                        Product #{item.productId}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                            <td>
                              {item.hsnsac ? (
                                <span className="invoice-mono-badge">
                                  {item.hsnsac}
                                </span>
                              ) : (
                                "\u2014"
                              )}
                            </td>
                            <td className="numeric">
                              <span className="invoice-qty-val">
                                {item.quantity}
                              </span>
                              {item.unit && (
                                <span className="invoice-unit-tag">
                                  {item.unit}
                                </span>
                              )}
                            </td>
                            <td className="numeric">
                              {money(item.unitPrice, row.currency)}
                            </td>
                            <td className="numeric">
                              {money(item.discountAmount, row.currency)}
                            </td>
                            <td>
                              {item.taxType || "\u2014"}{" "}
                              {item.taxRate == null
                                ? ""
                                : `(${item.taxRate}%)`}
                            </td>
                            <td className="numeric">
                              {money(item.taxAmount, row.currency)}
                            </td>
                            <td className="numeric">
                              <strong>
                                {money(item.totalAmount, row.currency)}
                              </strong>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="invoice-items-totals-wrapper">
                  <InvoiceTotals invoice={row} />
                </div>
              </div>
            </section>
          )}

          {/* Tab 3: Payments */}
          {tab === "Payments" && (
            <section className="invoice-panel invoice-tab-content">
              <div className="invoice-payments-tab-container">
                <div className="invoice-summary-grid invoice-tab-metric-grid">
                  <div className="invoice-summary-card invoice-tone-sand">
                    <span>Total Invoiced</span>
                    <strong>{money(row.totalAmount, row.currency)}</strong>
                    <small>{row.currency}</small>
                  </div>
                  <div className="invoice-summary-card invoice-tone-mint">
                    <span>Total Paid</span>
                    <strong>{money(row.paidAmount, row.currency)}</strong>
                    <small>{row.currency}</small>
                  </div>
                  <div
                    className={`invoice-summary-card ${
                      Number(row.balanceAmount) > 0
                        ? "invoice-tone-amber"
                        : "invoice-tone-mint"
                    }`}
                  >
                    <span>Outstanding Balance</span>
                    <strong>{money(row.balanceAmount, row.currency)}</strong>
                    <small>{row.currency}</small>
                  </div>
                </div>

                <div className="invoice-tab-toolbar">
                  <div>
                    <h2>Payment Transactions</h2>
                    <p>
                      Payments recorded and allocated against this invoice.
                    </p>
                  </div>
                  {canRecordPayment && (
                    <Button
                      variant="contained"
                      startIcon={<PaymentOutlined />}
                      onClick={() =>
                        navigate("/payments/new", {
                          state: { invoiceId: row.id },
                        })
                      }
                    >
                      Record Payment
                    </Button>
                  )}
                </div>

                <InvoiceState
                  loading={payments.isFetching}
                  error={payments.error}
                  retry={() => payments.refetch()}
                />

                {!payments.error && payments.data && (
                  <>
                    {payments.data.items.length === 0 ? (
                      <div className="invoice-empty-card">
                        <PaymentOutlined className="invoice-empty-card-icon" />
                        <h3>No Payments Recorded</h3>
                        <p>
                          No payment transactions have been logged against this
                          invoice yet.
                        </p>
                        {canRecordPayment && (
                          <Button
                            variant="contained"
                            startIcon={<PaymentOutlined />}
                            onClick={() =>
                              navigate("/payments/new", {
                                state: { invoiceId: row.id },
                              })
                            }
                          >
                            Record First Payment
                          </Button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="invoice-table-scroll">
                          <table className="invoice-table">
                            <thead>
                              <tr>
                                <th>Payment Number</th>
                                <th>Date</th>
                                <th className="numeric">Amount</th>
                                <th>Method</th>
                                <th>Reference</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {payments.data.items.map((entry) => (
                                <tr key={entry.id}>
                                  <td>
                                    <Link
                                      to={`/payments/${entry.id}`}
                                      className="invoice-cell-link"
                                    >
                                      {entry.paymentNumber}
                                    </Link>
                                  </td>
                                  <td>{date(entry.paymentDate)}</td>
                                  <td className="numeric">
                                    {money(
                                      entry.amount,
                                      entry.currency || row.currency,
                                    )}
                                  </td>
                                  <td>
                                    {entry.methodDisplay ||
                                      entry.paymentMethod ||
                                      "\u2014"}
                                  </td>
                                  <td>{entry.reference || "\u2014"}</td>
                                  <td>
                                    <InvoiceStatus status={entry.status} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {payments.data.totalPages > 1 && (
                          <div className="invoice-pagination">
                            <span>
                              Page {page} of {payments.data.totalPages} (
                              {payments.data.totalCount} total)
                            </span>
                            <Button
                              disabled={page === 1 || payments.isFetching}
                              onClick={() => setPage((p) => p - 1)}
                            >
                              Previous
                            </Button>
                            <Button
                              disabled={
                                page >= payments.data.totalPages ||
                                payments.isFetching
                              }
                              onClick={() => setPage((p) => p + 1)}
                            >
                              Next
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {/* Tab 4: Credit Notes */}
          {tab === "Credit Notes" && (
            <section className="invoice-panel invoice-tab-content">
              <div className="invoice-credits-tab-container">
                <div className="invoice-summary-grid invoice-tab-metric-grid">
                  <div className="invoice-summary-card invoice-tone-sand">
                    <span>Total Invoiced</span>
                    <strong>{money(row.totalAmount, row.currency)}</strong>
                    <small>{row.currency}</small>
                  </div>
                  <div className="invoice-summary-card invoice-tone-amber">
                    <span>Total Credited</span>
                    <strong>
                      {money(row.creditedAmount || 0, row.currency)}
                    </strong>
                    <small>{row.currency}</small>
                  </div>
                  <div className="invoice-summary-card invoice-tone-mint">
                    <span>Net Invoice Value</span>
                    <strong>
                      {money(
                        Math.max(
                          0,
                          (row.totalAmount || 0) - (row.creditedAmount || 0),
                        ),
                        row.currency,
                      )}
                    </strong>
                    <small>{row.currency}</small>
                  </div>
                </div>

                <div className="invoice-tab-toolbar">
                  <div>
                    <h2>Credit Notes &amp; Adjustments</h2>
                    <p>
                      Credit adjustments and credit notes linked to this
                      invoice.
                    </p>
                  </div>
                  {canCreateCredit && (
                    <Button
                      variant="contained"
                      startIcon={<ReceiptLongOutlined />}
                      onClick={() =>
                        navigate("/credit-notes/new", {
                          state: { invoiceId: row.id },
                        })
                      }
                    >
                      Create Credit Note
                    </Button>
                  )}
                </div>

                <InvoiceState
                  loading={credits.isFetching}
                  error={credits.error}
                  retry={() => credits.refetch()}
                />

                {!credits.error && credits.data && (
                  <>
                    {credits.data.items.length === 0 ? (
                      <div className="invoice-empty-card">
                        <ReceiptLongOutlined className="invoice-empty-card-icon" />
                        <h3>No Credit Notes Issued</h3>
                        <p>
                          No credit adjustments or notes have been issued
                          against this invoice.
                        </p>
                        {canCreateCredit && (
                          <Button
                            variant="contained"
                            startIcon={<ReceiptLongOutlined />}
                            onClick={() =>
                              navigate("/credit-notes/new", {
                                state: { invoiceId: row.id },
                              })
                            }
                          >
                            Issue Credit Note
                          </Button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="invoice-table-scroll">
                          <table className="invoice-table">
                            <thead>
                              <tr>
                                <th>Credit Note Number</th>
                                <th>Date</th>
                                <th>Reason</th>
                                <th className="numeric">Amount</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {credits.data.items.map((entry) => (
                                <tr key={entry.id}>
                                  <td>
                                    <Link
                                      to={`/credit-notes/${entry.id}`}
                                      className="invoice-cell-link"
                                    >
                                      {entry.number}
                                    </Link>
                                  </td>
                                  <td>{date(entry.date)}</td>
                                  <td>{entry.reason || "\u2014"}</td>
                                  <td className="numeric">
                                    {money(
                                      entry.totalAmount ?? entry.total,
                                      entry.currency || row.currency,
                                    )}
                                  </td>
                                  <td>
                                    <InvoiceStatus status={entry.status} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {credits.data.totalPages > 1 && (
                          <div className="invoice-pagination">
                            <span>
                              Page {page} of {credits.data.totalPages} (
                              {credits.data.totalCount} total)
                            </span>
                            <Button
                              disabled={page === 1 || credits.isFetching}
                              onClick={() => setPage((p) => p - 1)}
                            >
                              Previous
                            </Button>
                            <Button
                              disabled={
                                page >= credits.data.totalPages ||
                                credits.isFetching
                              }
                              onClick={() => setPage((p) => p + 1)}
                            >
                              Next
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {/* Tab 5: Communication */}
          {tab === "Communication" && (
            <section className="invoice-panel invoice-tab-content">
              <div className="invoice-comm-tab-container">
                <div className="invoice-detail-card invoice-comm-card">
                  <div className="invoice-detail-card-header">
                    <div className="invoice-detail-card-title-group">
                      <EmailOutlined className="invoice-detail-card-icon" />
                      <div>
                        <h3>Dispatch &amp; Communication Channel</h3>
                        <p>
                          Invoice delivery status and customer correspondence
                        </p>
                      </div>
                    </div>
                    <Chip
                      label="Backend Dependency"
                      size="small"
                      className="invoice-dependency-chip"
                    />
                  </div>

                  <Alert severity="info" className="invoice-comm-alert">
                    The billing backend server does not currently provide an
                    automated SMTP dispatch queue or persistent email
                    communication log API. Invoices can be manually dispatched
                    to customer contacts via the generated enterprise PDF.
                  </Alert>

                  <div
                    className="invoice-customer-dossier-grid"
                    style={{ marginTop: 22 }}
                  >
                    <div className="invoice-dossier-field">
                      <span className="invoice-dossier-label">
                        Recipient Customer
                      </span>
                      <strong className="invoice-dossier-value">
                        {customerData?.name || "\u2014"}
                      </strong>
                    </div>
                    <div className="invoice-dossier-field">
                      <span className="invoice-dossier-label">
                        Billing Email
                      </span>
                      <span
                        className="invoice-dossier-value"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {customerData?.email || "No email on record"}
                        {customerData?.email && (
                          <Tooltip
                            title={
                              copied ? "Copied!" : "Copy email address"
                            }
                          >
                            <IconButton
                              size="small"
                              onClick={() =>
                                handleCopyEmail(customerData.email)
                              }
                            >
                              {copied ? (
                                <CheckCircleOutline
                                  fontSize="small"
                                  color="success"
                                />
                              ) : (
                                <ContentCopyOutlined fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>
                        )}
                      </span>
                    </div>
                    <div className="invoice-dossier-field">
                      <span className="invoice-dossier-label">
                        Contact Phone
                      </span>
                      <span className="invoice-dossier-value">
                        {customerData?.phone || "\u2014"}
                      </span>
                    </div>
                    <div className="invoice-dossier-field">
                      <span className="invoice-dossier-label">
                        Delivery Readiness
                      </span>
                      <span className="invoice-dossier-value">
                        {row.status === "Draft"
                          ? "Draft invoice must be issued prior to dispatch"
                          : "Official PDF generated & ready for customer transmission"}
                      </span>
                    </div>
                  </div>

                  <div className="invoice-comm-actions">
                    {canDownloadPdf && (
                      <Button
                        variant="contained"
                        startIcon={<PictureAsPdfOutlined />}
                        onClick={() => invoiceService.downloadPdf(row)}
                      >
                        Download PDF for Customer Dispatch
                      </Button>
                    )}
                    <Button
                      variant="outlined"
                      component={Link}
                      to={`/invoices/${row.id}/preview`}
                      startIcon={<DescriptionOutlined />}
                    >
                      Open Document Preview
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Tab 6: Audit */}
          {tab === "Audit" && (
            <section className="invoice-panel invoice-tab-content">
              <div className="invoice-audit-tab-container">
                <div className="invoice-table-heading">
                  <div>
                    <h2>Invoice Audit Trail</h2>
                    <p>
                      Immutable log of administrative events, issuing actions,
                      and state changes.
                    </p>
                  </div>
                  <span className="invoice-count-badge">
                    {audit.data?.items?.length || 0} Events on this page
                  </span>
                </div>

                <Alert severity="info" className="invoice-audit-notice">
                  The server provides tenant-wide invoice audit pages. Only
                  records matching this invoice ID ({row.id}) are displayed on
                  the current page; browse pages for older activity.
                </Alert>

                <InvoiceState
                  loading={audit.isFetching}
                  error={audit.error}
                  retry={() => audit.refetch()}
                />

                {!audit.error && audit.data && (
                  <>
                    {audit.data.items.length === 0 ? (
                      <div className="invoice-empty-card">
                        <HistoryOutlined className="invoice-empty-card-icon" />
                        <h3>No Matching Audit Events</h3>
                        <p>
                          No audit activity matching this invoice was found on
                          page {page}.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="invoice-table-scroll">
                          <table className="invoice-table invoice-audit-table">
                            <thead>
                              <tr>
                                <th style={{ width: "160px" }}>Action</th>
                                <th style={{ width: "180px" }}>User</th>
                                <th style={{ width: "190px" }}>
                                  Date &amp; Time
                                </th>
                                <th>Details &amp; Field Changes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {audit.data.items.map((entry) => (
                                <tr key={entry.id}>
                                  <td>
                                    <span className="invoice-audit-action-badge">
                                      {entry.action}
                                    </span>
                                  </td>
                                  <td>
                                    <div className="invoice-audit-user">
                                      <span className="invoice-audit-user-avatar">
                                        {(entry.userName || "U")
                                          .charAt(0)
                                          .toUpperCase()}
                                      </span>
                                      <span>
                                        {entry.userName || "System"}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="invoice-audit-time">
                                    {entry.timestamp}
                                  </td>
                                  <td className="invoice-preserve-text invoice-audit-changes">
                                    {entry.changes || "\u2014"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {audit.data.totalPages > 1 && (
                          <div className="invoice-pagination">
                            <span>
                              Page {page} of {audit.data.totalPages}
                            </span>
                            <Button
                              disabled={page === 1 || audit.isFetching}
                              onClick={() => setPage((p) => p - 1)}
                            >
                              Previous
                            </Button>
                            <Button
                              disabled={
                                page >= audit.data.totalPages ||
                                audit.isFetching
                              }
                              onClick={() => setPage((p) => p + 1)}
                            >
                              Next
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* Issue Invoice Confirmation Dialog */}
      <Dialog
        open={issueDialogOpen}
        onClose={issuing ? undefined : () => setIssueDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Issue Invoice</DialogTitle>
        <DialogContent>
          {row && (
            <>
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: "14px",
                  color: "var(--text-primary)",
                }}
              >
                Are you sure you want to issue draft{" "}
                <strong>{identifier(row)}</strong>?
              </p>
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                }}
              >
                The backend will assign the official sequential invoice number
                and finalize the status to <strong>Issued</strong>.
              </p>
              {issueError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {issueError}
                </Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={issuing} onClick={() => setIssueDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={issuing}
            onClick={async () => {
              setIssuing(true);
              setIssueError("");
              try {
                const issued = await invoiceService.issue(row.id);
                await invalidateInvoices(client);
                await invoice.refetch();
                setIssueDialogOpen(false);
                setNotice(
                  `Invoice issued successfully as ${issued.invoiceNumber || identifier(issued)}.`,
                );
              } catch (err) {
                setIssueError(invoiceError(err));
              } finally {
                setIssuing(false);
              }
            }}
            startIcon={<SendOutlined />}
          >
            {issuing ? "Issuing..." : "Confirm & Issue"}
          </Button>
        </DialogActions>
      </Dialog>
    </InvoiceShell>
  );
}
