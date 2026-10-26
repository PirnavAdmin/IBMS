import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  InputAdornment,
  MenuItem,
  TextField,
} from "@mui/material";
import {
  Add,
  CheckCircleOutline,
  DescriptionOutlined,
  HourglassEmptyOutlined,
  ReceiptLongOutlined,
  Refresh,
  RestartAlt,
  Search,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { invoiceService, invoiceQuery, invoiceError, INVOICE_STATUSES } from "./services/invoiceService";
import { downloadInvoiceCsv } from './services/invoiceExport';
import { billingCurrencyGroups } from '../../utils/currencies';
import { InvoiceActions } from "./components/InvoiceActions";
import { WorkspacePagination } from "../../components/WorkspacePagination";
import { InvoiceDateRangeFilter } from "./components/InvoiceDateRangeFilter";
import {
  InvoiceShell,
  InvoiceState,
  InvoiceStatus,
  money,
  date,
  identifier,
  useDebounced,
  useInvoiceUser,
} from "./components/InvoiceShared";
export const initialFilters = {
  status: "",
  customerId: "",
  startDate: "",
  endDate: "",
  currency: "",
  paymentState: "",
  page: 1,
  pageSize: 20,
  sortBy: "InvoiceDate",
  sortOrder: "desc",
};
function KpiDonut({ percent = 0, icon }) {
  const visualPercent = percent > 0 ? Math.max(6, Math.min(100, percent)) : 0;
  const circumference = 119.38;
  const strokeDashoffset =
    visualPercent === 0
      ? circumference
      : circumference - (visualPercent / 100) * circumference;

  return (
    <div className="invoice-kpi-donut-wrap" aria-hidden="true">
      <svg
        className="invoice-kpi-donut-svg"
        viewBox="0 0 48 48"
        width="48"
        height="48"
      >
        <circle
          className="invoice-kpi-donut-track"
          cx="24"
          cy="24"
          r="19"
        />
        <circle
          className="invoice-kpi-donut-progress"
          cx="24"
          cy="24"
          r="19"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeOpacity={percent > 0 ? 1 : 0}
          transform="rotate(-90 24 24)"
        />
      </svg>
      <span className="invoice-kpi-donut-icon">{icon}</span>
    </div>
  );
}

export function InvoiceList() {
  const location = useLocation();
  const navigationFilters = () => {
    const params = new URLSearchParams(location.search);
    return { ...initialFilters, ...Object.fromEntries(['status', 'paymentState', 'currency', 'startDate', 'endDate'].filter(key => params.has(key)).map(key => [key, params.get(key)])) };
  };
  const context = useOutletContext() || {};
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(navigationFilters);
  useEffect(() => { setFilters(navigationFilters()); }, [location.search]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customer, setCustomer] = useState(null);
  const exportLock = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState(null);
  const user = useInvoiceUser();
  const querySearch = useDebounced(context.searchQuery || search);
  const customerTerm = useDebounced(customerSearch);
  useEffect(
    () => setFilters((previous) => ({ ...previous, page: 1 })),
    [querySearch],
  );
  const change = (key, value) =>
    setFilters((previous) => ({ ...previous, [key]: value, page: 1 }));
  const invalidDates =
    filters.startDate && filters.endDate && filters.startDate > filters.endDate;
  const list = useQuery({
    queryKey: ["invoices", "list", filters, querySearch],
    queryFn: ({ signal }) =>
      invoiceService.list({ ...filters, search: querySearch }, { signal }),
    enabled: user.permissions.view && !invalidDates,
    retry: false,
    staleTime: 0,
  });
  const summary = useQuery({
    queryKey: ["invoices", "summary"],
    queryFn: ({ signal }) => invoiceService.summary({ signal }),
    enabled: user.permissions.view,
    retry: false,
    staleTime: 0,
  });
  const customers = useQuery({
    queryKey: ["invoices", "customers", customerTerm],
    queryFn: () => invoiceService.customers(customerTerm),
    enabled: user.permissions.view,
    retry: false,
  });
  const sort = (field) =>
    setFilters((previous) => ({
      ...previous,
      sortBy: field,
      sortOrder:
        previous.sortBy === field && previous.sortOrder === "asc"
          ? "desc"
          : "asc",
      page: 1,
    }));
  const sortHeading = (label, field) => (
    <button className="invoice-sort" onClick={() => sort(field)}>
      {label}
      {filters.sortBy === field
        ? filters.sortOrder === "asc"
          ? " \u2191"
          : " \u2193"
        : ""}
    </button>
  );
  const rows = list.data?.items || [];
  const exportCsv = async () => {
    if (exportLock.current || !user.permissions.view || invalidDates) return;
    exportLock.current = true;
    setExporting(true);
    setExportMessage(null);
    try {
      await downloadInvoiceCsv(invoiceQuery({ ...filters, search: querySearch }));
      setExportMessage({ severity: 'info', text: 'CSV downloaded. The server exports at most the first 10,000 matching invoices; export completeness is not verified. Refine filters for larger result sets.' });
    } catch (error) {
      setExportMessage({ severity: 'error', text: invoiceError(error) });
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  };
  return (
    <InvoiceShell
      title="Invoices"
      subtitle="Create, issue and manage customer invoices."
      actions={
        <>
          <Button variant="outlined" disabled={exporting || !user.permissions.view || Boolean(invalidDates)} onClick={exportCsv}>
            {exporting ? 'Exporting CSV...' : 'Export CSV'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={() => {
              list.refetch();
              summary.refetch();
            }}
            disabled={list.isFetching || !user.permissions.view}
          >
            Refresh
          </Button>
          {(user.permissions.create || user.permissions.canCreate || user.permissions.manage) && (
            <Button
              component={Link}
              to="/invoices/new"
              variant="contained"
              className="invoice-create-button"
              startIcon={<Add />}
            >
              Create Invoice
            </Button>
          )}
        </>
      }
    >
      {!user.isPending && !user.permissions.view && (
        <Alert severity="warning">
          You do not have permission to view invoices.
        </Alert>
      )}
      {billingCurrencyGroups(summary.data || []).map((group) => {
        const totalInvoicedNum = Number(group.totalInvoiced) || 0;
        const totalPaidNum = Number(group.totalPaid) || 0;
        const totalOutstandingNum = Number(group.totalOutstanding) || 0;
        const overdueAmountNum = Number(group.overdueAmount) || 0;
        const overdueCountNum = Number(group.overdueCount) || 0;
        const draftCountNum = Number(group.draftCount) || 0;
        const draftAmountNum = Number(group.draftAmount) || 0;
        const totalPortfolio = totalInvoicedNum + draftAmountNum;

        const kpiCards = [
          {
            label: "Total Invoiced",
            formattedValue: money(group.totalInvoiced, group.currency),
            paymentState: "Invoiced",
            statusFilter: "",
            icon: <ReceiptLongOutlined />,
            tone: "invoice-tone-sand",
            progress: 100,
          },
          {
            label: "Total Paid",
            formattedValue: money(group.totalPaid, group.currency),
            paymentState: "Paid",
            statusFilter: "",
            icon: <CheckCircleOutline />,
            tone: "invoice-tone-mint",
            progress:
              totalInvoicedNum > 0
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      Math.round((totalPaidNum / totalInvoicedNum) * 100)
                    )
                  )
                : totalPaidNum > 0
                ? 100
                : 0,
          },
          {
            label: "Total Outstanding",
            formattedValue: money(group.totalOutstanding, group.currency),
            paymentState: "Outstanding",
            statusFilter: "",
            icon: <HourglassEmptyOutlined />,
            tone: "invoice-tone-amber",
            progress:
              totalInvoicedNum > 0
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      Math.round(
                        (totalOutstandingNum / totalInvoicedNum) * 100
                      )
                    )
                  )
                : 0,
          },
          {
            label: "Overdue Amount",
            formattedValue: money(group.overdueAmount, group.currency),
            countText: `${overdueCountNum} invoices`,
            paymentState: "Overdue",
            statusFilter: "",
            icon: <WarningAmberOutlined />,
            tone: "invoice-tone-rose",
            progress:
              totalInvoicedNum > 0
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      Math.round((overdueAmountNum / totalInvoicedNum) * 100)
                    )
                  )
                : 0,
          },
          {
            label: "Draft Amount",
            formattedValue: money(group.draftAmount, group.currency),
            countText: `${draftCountNum} invoices`,
            paymentState: "",
            statusFilter: "Draft",
            icon: <DescriptionOutlined />,
            tone: "invoice-tone-amber",
            progress:
              totalPortfolio > 0
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      Math.round((draftAmountNum / totalPortfolio) * 100)
                    )
                  )
                : draftAmountNum > 0
                ? 100
                : 0,
          },
        ];

        return (
          <section
            key={group.currency}
            className="invoice-summary-group"
            aria-label={`${group.currency} invoice summary`}
          >
            <h2>{group.currency} / All invoices</h2>
            <div className="invoice-summary-grid" tabIndex={0} role="region" aria-label={`${group.currency} invoice summary cards`}>
              {kpiCards.map(
                ({
                  label,
                  formattedValue,
                  countText,
                  paymentState,
                  statusFilter,
                  icon,
                  tone,
                  progress,
                }) => {
                  const isActive =
                    filters.currency === group.currency &&
                    (label === "Total Invoiced"
                      ? (!filters.paymentState || filters.paymentState === "Invoiced") && !filters.status
                      : label === "Total Paid"
                      ? filters.paymentState === "Paid" && !filters.status
                      : label === "Total Outstanding"
                      ? filters.paymentState === "Outstanding" && !filters.status
                      : label === "Overdue Amount"
                      ? filters.paymentState === "Overdue" && !filters.status
                      : label === "Draft Amount"
                      ? filters.status === "Draft" && !filters.paymentState
                      : false);

                  return (
                    <button aria-label={`Filter invoices by ${label} (${group.currency})`}
                      key={label}
                      type="button"
                      className={`invoice-summary-card invoice-kpi-circular-card ${tone} ${
                        isActive ? "is-active" : ""
                      }`}
                      onClick={() =>
                        setFilters((previous) => ({
                          ...previous,
                          currency: group.currency,
                          paymentState: paymentState || "",
                          status: statusFilter || "",
                          page: 1,
                        }))
                      }

                    >
                      <span className="invoice-kpi-label">{label}</span>
                      <KpiDonut percent={progress} icon={icon} />
                      <div className="invoice-kpi-value-block">
                        <strong
                          className="invoice-kpi-value"
                          title={formattedValue}
                        >
                          {formattedValue}
                        </strong>
                        {countText && <small className="invoice-kpi-count-text">{countText}</small>}
                        <small className="invoice-kpi-subtext">
                          Filter invoices
                        </small>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </section>
        );
      })}
      <section className="invoice-panel invoice-list-panel">
        <div className="invoice-filters">
          <TextField
            className="invoice-filter-search"
            placeholder="Search Invoice Number"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              context.onSearch?.("");
              change("page", 1);
            }}
            type="search"
            size="small"
            inputProps={{
              "aria-label": "Search Invoice Number",
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: "var(--secondary)", fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select
            size="small"
            label="Status"
            value={filters.status}
            onChange={(event) => change("status", event.target.value)}
            className="invoice-filter-status"
          >
            <MenuItem value="">All statuses</MenuItem>
            {INVOICE_STATUSES.map((status) => (
              <MenuItem key={status} value={status}>
                {status}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            className="invoice-filter-customer"
            size="small"
            options={customers.data?.items || []}
            filterOptions={(options) => options}
            value={customer}
            loading={customers.isFetching}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onInputChange={(_, value) => setCustomerSearch(value)}
            onChange={(_, value) => {
              setCustomer(value);
              change("customerId", value?.id || "");
            }}
            renderInput={(params) => <TextField {...params} size="small" label="Customer" />}
          />
          <InvoiceDateRangeFilter
            startDate={filters.startDate}
            endDate={filters.endDate}
            onApply={(dates) => setFilters((previous) => ({
              ...previous, ...dates, page: 1,
            }))}
          />
          <TextField
            select
            size="small"
            label="Payment state"
            value={filters.paymentState}
            onChange={(event) => change("paymentState", event.target.value)}
            className="invoice-filter-payment"
          >
            <MenuItem value="">All payment states</MenuItem>
            {["Invoiced", "Paid", "Partially Paid", "Unpaid", "Outstanding", "Overdue"].map(
              (state) => (
                <MenuItem key={state} value={state}>
                  {state}
                </MenuItem>
              ),
            )}
          </TextField>
          <Button
            variant="outlined"
            size="small"
            className="invoice-filter-reset"
            startIcon={<RestartAlt />}
            onClick={() => {
              setFilters(initialFilters);
              setSearch("");
              context.onSearch?.("");
              setCustomer(null);
            }}
          >
            Reset Filters
          </Button>
        </div>
        {invalidDates && (
          <Alert severity="error">
            End date must be on or after start date.
          </Alert>
        )}
        <InvoiceState
          loading={list.isFetching}
          error={list.error}
          retry={() => list.refetch()}
        />
        {!invalidDates && !list.error && (
          <div className="invoice-table-card ibms-table-frame">
            <div className="invoice-table-heading">
              <div className="invoice-list-heading-title">
                <h2>Invoices</h2>
                <span>All customer invoices</span>
              </div>
              {list.data && <span className="invoice-count-badge">{list.data.totalCount} invoices</span>}
            </div>
            <div
              className="invoice-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Invoice table"
            >
              <table className="invoice-table invoice-list-table">
                <thead>
                  <tr>
                    <th
                      aria-sort={
                        filters.sortBy === "InvoiceNumber"
                          ? filters.sortOrder === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      {sortHeading("Invoice Number", "InvoiceNumber")}
                    </th>
                    <th>Customer</th>
                    <th
                      aria-sort={
                        filters.sortBy === "InvoiceDate"
                          ? filters.sortOrder === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      {sortHeading("Invoice Date", "InvoiceDate")}
                    </th>
                    <th>Due Date</th>
                    <th>Currency</th>
                    <th>Subtotal</th>
                    <th>Discount</th>
                    <th>Tax</th>
                    <th>Charges</th>
                    <th>Rounding</th>
                    <th>
                      {sortHeading("Grand Total", "TotalAmount")}
                    </th>
                    <th>Paid</th>
                    <th>
                      {sortHeading("Outstanding", "BalanceAmount")}
                    </th>
                    <th>Status</th>
                    <th className="invoice-actions-cell">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <Link to={`/invoices/${invoice.id}`}>
                          {identifier(invoice)}
                        </Link>
                      </td>
                      <td>{invoice.customer?.name || "\u2014"}</td>
                      <td>{date(invoice.invoiceDate)}</td>
                      <td>{date(invoice.dueDate)}</td>
                      <td>{invoice.currency}</td>
                      {[
                        "subtotal",
                        "discountAmount",
                        "taxAmount",
                        "chargesAmount",
                        "roundingAmount",
                        "totalAmount",
                        "paidAmount",
                        "balanceAmount",
                      ].map((key) => (
                        <td
                          key={key}
                          className={
                            key === "totalAmount" || key === "balanceAmount"
                              ? "invoice-amount-highlight"
                              : "invoice-amount-cell"
                          }
                        >
                          {money(invoice[key], invoice.currency)}
                        </td>
                      ))}
                      <td>
                        <InvoiceStatus status={invoice.status} />
                      </td>
                      <td className="invoice-actions-cell">
                        <InvoiceActions
                          invoice={invoice}
                          permissions={user.permissions}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <InvoiceState
          empty={
            list.data && !rows.length
              ? "No invoices found. Create an invoice or adjust your filters."
              : ""
          }
        />
        {list.data && <WorkspacePagination
          page={list.data.pageNumber}
          pageSize={list.data.pageSize}
          totalCount={list.data.totalCount}
          itemLabel="invoices"
          disabled={list.isFetching}
          onPageChange={(page) => change("page", page)}
          onPageSizeChange={(pageSize) => change("pageSize", pageSize)}
        />}
      </section>
      <p className="invoice-footnote">
        CSV export uses the current filters and sorting, with a server limit of 10,000 invoices.
      </p>
      {exportMessage && <Alert severity={exportMessage.severity} role="status">{exportMessage.text}</Alert>}
    </InvoiceShell>
  );
}
