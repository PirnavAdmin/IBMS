import { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  MenuItem,
  TextField,
} from "@mui/material";
import { Add, Refresh, RestartAlt } from "@mui/icons-material";
import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { invoiceService, INVOICE_STATUSES } from "./services/invoiceService";
import { InvoiceActions } from "./components/InvoiceActions";
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
export function InvoiceList() {
  const context = useOutletContext() || {};
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customer, setCustomer] = useState(null);
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
  return (
    <InvoiceShell
      title="Invoices"
      subtitle="Create, issue and manage customer invoices."
      actions={
        <>
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
          {user.permissions.manage && (
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
      <InvoiceState
        loading={user.isPending}
        error={user.error}
        retry={() => user.refetch()}
      />
      {!user.isPending && !user.error && !user.permissions.view && (
        <Alert severity="warning">
          Invoice access requires TenantAdmin or SuperAdmin.
        </Alert>
      )}
      <InvoiceState
        loading={summary.isFetching && !summary.data}
        error={summary.error}
        retry={() => summary.refetch()}
      />
      {summary.data?.map((group) => (
        <section
          key={group.currency}
          className="invoice-summary-group"
          aria-label={`${group.currency} invoice summary`}
        >
          <h2>{group.currency} / All invoices</h2>
          <div className="invoice-summary-grid">
            {[
              ["Total Invoiced", group.totalInvoiced, null],
              ["Total Paid", group.totalPaid, null],
              ["Outstanding", group.totalOutstanding, "Outstanding"],
              ["Overdue", group.overdueAmount, "Overdue"],
            ].map(([label, value, paymentState]) => (
              <button
                key={label}
                className="invoice-summary-card"
                disabled={!paymentState}
                onClick={() =>
                  setFilters((previous) => ({
                    ...previous,
                    currency: group.currency,
                    paymentState,
                    status: "",
                    page: 1,
                  }))
                }
              >
                <span>{label}</span>
                <strong>{money(value, group.currency)}</strong>
                <small>
                  {paymentState ? "Filter invoices" : "Currency-scoped total"}
                </small>
              </button>
            ))}
          </div>
        </section>
      ))}
      <section className="invoice-panel invoice-list-panel">
        <div className="invoice-filters">
          <TextField
            className="invoice-filter-search"
            label="Search number, customer or reference"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              context.onSearch?.("");
              change("page", 1);
            }}
            type="search"
          />
          <TextField
            select
            label="Status"
            value={filters.status}
            onChange={(event) => change("status", event.target.value)}
          >
            <MenuItem value="">All statuses</MenuItem>
            {INVOICE_STATUSES.map((status) => (
              <MenuItem key={status} value={status}>
                {status}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
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
            renderInput={(params) => <TextField {...params} label="Customer" />}
          />
          <TextField
            className="invoice-filter-from"
            type="date"
            label="Invoice date from"
            value={filters.startDate}
            onChange={(event) => change("startDate", event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            className="invoice-filter-to"
            type="date"
            label="Invoice date to"
            value={filters.endDate}
            onChange={(event) => change("endDate", event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            className="invoice-filter-currency"
            label="Currency"
            value={filters.currency}
            onChange={(event) =>
              change("currency", event.target.value.toUpperCase())
            }
            inputProps={{ maxLength: 3 }}
          />
          <TextField
            select
            label="Payment state"
            value={filters.paymentState}
            onChange={(event) => change("paymentState", event.target.value)}
          >
            <MenuItem value="">All payment states</MenuItem>
            {["Paid", "Partially Paid", "Unpaid", "Outstanding", "Overdue"].map(
              (state) => (
                <MenuItem key={state} value={state}>
                  {state}
                </MenuItem>
              ),
            )}
          </TextField>
          <Button
            variant="outlined"
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
          error={customers.error}
          retry={() => customers.refetch()}
        />
        <InvoiceState
          loading={list.isFetching}
          error={list.error}
          retry={() => list.refetch()}
        />
        {!invalidDates && !list.error && (
          <div className="invoice-table-card">
            <div className="invoice-table-heading">
              <div>
                <h2>Invoices</h2>
                <p>All customer invoices</p>
              </div>
              {list.data && <span>{list.data.totalCount} invoices</span>}
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
                    <th className="numeric">Subtotal</th>
                    <th className="numeric">Discount</th>
                    <th className="numeric">Tax</th>
                    <th className="numeric">Charges</th>
                    <th className="numeric">
                      {sortHeading("Grand Total", "TotalAmount")}
                    </th>
                    <th className="numeric">Paid</th>
                    <th className="numeric">
                      {sortHeading("Outstanding", "BalanceAmount")}
                    </th>
                    <th className="invoice-cell-center">Status</th>
                    <th className="invoice-cell-center invoice-actions-cell">
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
                        "totalAmount",
                        "paidAmount",
                        "balanceAmount",
                      ].map((key) => (
                        <td className="numeric" key={key}>
                          {money(invoice[key], invoice.currency)}
                        </td>
                      ))}
                      <td className="invoice-cell-center">
                        <InvoiceStatus status={invoice.status} />
                      </td>
                      <td className="invoice-cell-center invoice-actions-cell">
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
        {list.data && (
          <footer className="invoice-pagination">
            <span>
              {list.data.totalCount} invoices / Page {list.data.pageNumber} of{" "}
              {Math.max(1, list.data.totalPages)}
            </span>
            <TextField
              select
              label="Rows"
              size="small"
              value={filters.pageSize}
              onChange={(event) =>
                change("pageSize", Number(event.target.value))
              }
            >
              {[10, 20, 50].map((size) => (
                <MenuItem key={size} value={size}>
                  {size}
                </MenuItem>
              ))}
            </TextField>
            <Button
              disabled={filters.page <= 1 || list.isFetching}
              onClick={() =>
                setFilters((previous) => ({
                  ...previous,
                  page: previous.page - 1,
                }))
              }
            >
              Previous
            </Button>
            <Button
              disabled={!list.data.hasNextPage || list.isFetching}
              onClick={() =>
                setFilters((previous) => ({
                  ...previous,
                  page: previous.page + 1,
                }))
              }
            >
              Next
            </Button>
          </footer>
        )}
      </section>
      <p className="invoice-footnote">
        Filtered export is unavailable on the current billing server.
      </p>
    </InvoiceShell>
  );
}
