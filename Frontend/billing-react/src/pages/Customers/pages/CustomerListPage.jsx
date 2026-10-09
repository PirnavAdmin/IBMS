import { CustomerCardDetails } from "../components/CustomerCardDetails";
import { FeedbackSnackbar } from '../../../components/FeedbackSnackbar';
import { useProductSelectProps } from '../../Products/components/ProductSelect';
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  Alert,
  Avatar,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Tooltip,
  MenuItem,
  Pagination,
  PaginationItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
} from "@mui/material";
import {
  Add,
  CheckCircleOutline,
  GroupOutlined,
  EditOutlined,
  VisibilityOutlined,
  PrintOutlined,
  PersonOffOutlined,
  Search,
  AccountBalanceWalletOutlined,
} from "@mui/icons-material";
import {
  useCustomers,
  useCustomerStatus,
  useCustomerSummary,
} from "../hooks/useCustomers";

import { useSearchCommit } from "../../../hooks/useSearchDebounce";
import { customerCapabilities } from "../api/customerContract";
import { DashboardErrorState } from "../../../components/dashboard/DashboardStates";
import "../styles/customer-list.css";

export const money = (value) =>
  value == null
    ? "—"
    : Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
export const StatusChip = ({ status }) =>
  !["active", "inactive"].includes(status) ? (
    <span>—</span>
  ) : (
    <span className={`customer-status ${status}`}>
      <i />
      {status}
    </span>
  );
const moneyWithCurrency = (value, currency) => {
  if (value == null || !Number.isFinite(value) || !currency?.trim()) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency.trim().toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return "—";
  }
};
const filterOptions = {
  status: {
    label: "Customer status",
    values: [
      ["active", "Active"],
      ["inactive", "Inactive"],
    ],
  },
  customerType: {
    label: "Customer type",
    values: [
      ["Individual", "Individual"],
      ["Business", "Business"],
      ["Organization", "Organization"],
    ],
  },
  taxRegistration: {
    label: "Tax registration",
    values: [
      ["Registered", "Registered"],
      ["Unregistered", "Unregistered"],
    ],
  },
  outstanding: {
    label: "Outstanding",
    values: [
      ["Has Outstanding", "Has Outstanding"],
      ["No Outstanding", "No Outstanding"],
    ],
  },
};
const columns = [
  ["customerCode", "Customer code"],
  ["name", "Customer"],
  ["customerType", "Type"],
  ["", "Tax ID / GSTIN"],
  ["", "Contact"],
  ["outstandingBalance", "Outstanding"],
  ["status", "Status"],
  ["", "Actions"],
];

const SORT_OPTIONS = [
  { label: "Recently Added", sortBy: "createdAt", sortOrder: "desc" },
  { label: "Alphabetical (A – Z)", sortBy: "name", sortOrder: "asc" },
  { label: "Alphabetical (Z – A)", sortBy: "name", sortOrder: "desc" },
  { label: "Price: Low to High", sortBy: "price", sortOrder: "asc" },
  { label: "Price: High to Low", sortBy: "price", sortOrder: "desc" },
  { label: "First Added", sortBy: "id", sortOrder: "asc" },
  { label: "Last Added", sortBy: "id", sortOrder: "desc" },
];

const ALLOWED_SORT_FIELDS = [
  "customerCode",
  "name",
  "createdAt",
  "price",
  "id",
  "email",
  "companyName",
  "code",
  "updatedAt",
];

function getSortValue(sortBy, sortOrder) {
  const match = SORT_OPTIONS.find(
    (o) => o.sortBy === sortBy && o.sortOrder === sortOrder
  );
  return match ? `${match.sortBy}:${match.sortOrder}` : "";
}

export function CustomerListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const summaryQuery = useCustomerSummary();
  const [url, setUrl] = useSearchParams();
  const sortSelectProps = useProductSelectProps();
  const params = {
    page: Math.max(1, Number(url.get("page")) || 1),
    pageSize: [10, 25, 50, 100].includes(Number(url.get("pageSize")))
      ? Number(url.get("pageSize"))
      : 10,
    search: url.get("search") || "",
    sortBy: ALLOWED_SORT_FIELDS.includes(url.get("sortBy"))
      ? url.get("sortBy")
      : "",
    sortOrder:
      url.get("sortOrder") === "desc"
        ? "desc"
        : url.get("sortOrder") === "asc"
        ? "asc"
        : "",
    ...Object.fromEntries(
      Object.entries(filterOptions).map(([key, option]) => [
        key,
        option.values.some(([value]) => value === url.get(key))
          ? url.get(key)
          : "",
      ])
    ),
  };
  const sortValue = getSortValue(params.sortBy, params.sortOrder);
  const handleSortChange = (value) => {
    if (!value) {
      change({ sortBy: "", sortOrder: "", page: 1 });
      return;
    }
    const option = SORT_OPTIONS.find(
      (o) => `${o.sortBy}:${o.sortOrder}` === value
    );
    if (option) {
      change({ sortBy: option.sortBy, sortOrder: option.sortOrder, page: 1 });
    }
  };
  const [search, setSearch] = useState(params.search);
  const change = (values) =>
    setUrl(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(values).forEach(([key, value]) =>
          value ? next.set(key, String(value)) : next.delete(key)
        );
        return next;
      },
      { replace: true }
    );
  useEffect(() => {
    setSearch(params.search);
  }, [params.search]);
  useSearchCommit(search.trim(), (nextSearch) => {
    if (nextSearch !== params.search) {
      change({ search: nextSearch, page: 1 });
    }
  });
  const query = useCustomers(params);
  const mutation = useCustomerStatus();
  const statusLock = useRef(false);
  const [confirm, setConfirm] = useState(null);
  const [inactiveDetails, setInactiveDetails] = useState(null);
  const [reason, setReason] = useState("");
  const cardView = params.outstanding === "Has Outstanding" ? "outstanding" : params.status || "total";
  const selectCard = (view) => {
    setSearch("");
    setUrl(view === "total" ? {} : view === "outstanding" ? { outstanding: "Has Outstanding" } : { status: view });
  };
  const [notice, setNotice] = useState(location.state?.customerNotice || "");
  useEffect(() => {
    if (location.state?.customerNotice)
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      });
  }, [location.state, location.pathname, location.search, navigate]);
  const data = query.data;
  const visibleCustomers = data?.items || [];
  const reset = () => {
    setSearch("");
    setUrl({});
  };
  const filtered =
    !!params.sortBy ||
    !!params.search ||
    Object.keys(filterOptions).some((key) => !!params[key]);
  return (
    <main className="customers-page">
      <nav className="customers-breadcrumb" aria-label="Breadcrumb">
        <strong aria-current="page">Customers</strong>
      </nav>
      <header className="customers-heading">
        <div>
          <h1>Customers</h1>
          <p>
            Manage customer profiles, billing information and account activity.
          </p>
        </div>
        <div className="customers-heading-actions">
          <Tooltip title="Print current customer page">
            <Button
              aria-label="Print current customer page"
              onClick={() => window.print()}
              variant="outlined"
              startIcon={<PrintOutlined />}
            >
              Print
            </Button>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate("/customers/create")}
          >
            Create Customer
          </Button>
        </div>
      </header>
      <section className="customer-stats" aria-label="Customer summary">
        {[
          {
            label: "Total Customers",
            view: "total",
            value: summaryQuery.data?.total,
            text: "Your customer network",
            icon: <GroupOutlined />,
            tone: "brown",
          },
          {
            label: "Active Customers",
            view: "active",
            value: summaryQuery.data?.active,
            text: "Ready for new invoices",
            icon: <CheckCircleOutline />,
            tone: "green",
          },
          {
            label: "Inactive Customers",
            view: "inactive",
            value: summaryQuery.data?.inactive,
            text: "History safely retained",
            icon: <PersonOffOutlined />,
            tone: "red",
          },
          {
            label: "Total Outstanding",
            view: "outstanding",
            value: summaryQuery.data
              ? moneyWithCurrency(
                  summaryQuery.data.outstanding,
                  summaryQuery.data.currency
                )
              : undefined,
            text: "Across all customers",
            icon: <AccountBalanceWalletOutlined />,
            tone: "orange",
          },
        ].map((stat) => (
          <button type="button" key={stat.label} className={`customer-stat ${stat.tone}`} aria-pressed={cardView === stat.view} onClick={() => selectCard(stat.view)}>
            <div className="customer-stat-top">
              <span>{stat.label}</span>
              <span className="customer-stat-icon">{stat.icon}</span>
            </div>
            <strong>
              {summaryQuery.isLoading ? (
                <Skeleton width="60%" />
              ) : (
                stat.value ?? "—"
              )}
            </strong>
            <small>{stat.text}</small>
          </button>
        ))}
      </section>
      <section className="customer-panel">
        <div className="customer-panel-heading">
          <div>
            <h2>
              {cardView === "inactive" ? "Inactive customers and reasons" : cardView === "active" ? "Active customers" : cardView === "outstanding" ? "Outstanding by customer and invoice" : "Customer directory"} <span>{data?.totalCount ?? "—"}</span>
            </h2>
            <p>{cardView === "inactive" ? "Review each inactive profile, its recorded reason and deactivation details." : cardView === "outstanding" ? "Unpaid invoices are listed by due date, earliest first." : "Select a customer name to view their profile and transactions."}</p>
          </div>
          {(query.isError || summaryQuery.isError) && (
            <span className="customer-result-count unavailable" role="status">
              {query.isError ? "Directory unavailable" : "Summary unavailable"}
            </span>
          )}
        </div>
        <div className="customer-filters">
          <TextField
            disabled={!customerCapabilities.search}
            className="customer-search"
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, code, email or mobile…"
            inputProps={{ "aria-label": "Search customers" }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <div className="customer-filter-row">
            {Object.entries(filterOptions).map(([key, option]) => (
              <TextField
                select
                size="small"
                label={option.label}
                key={key}
                InputLabelProps={{ shrink: true }}
                SelectProps={{ displayEmpty: true }}
                value={params[key] || ""}
                onChange={(event) =>
                  change({ [key]: event.target.value, page: 1 })
                }
              >
                <MenuItem value="">All</MenuItem>
                {option.values.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            ))}
            <TextField
              select
              SelectProps={sortSelectProps}
              label="Sort By"
              size="small"
              value={sortValue}
              onChange={(event) => handleSortChange(event.target.value)}
              className="customer-sort-select"
            >
              <MenuItem value="">Sort By</MenuItem>
              {SORT_OPTIONS.map((o) => (
                <MenuItem
                  key={`${o.sortBy}:${o.sortOrder}`}
                  value={`${o.sortBy}:${o.sortOrder}`}
                >
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <Button
              onClick={reset}
              disabled={!filtered && !search && !url.toString()}
            >
              Reset filters
            </Button>
          </div>
          {filtered && (
            <div className="customer-filter-chips">
              {params.sortBy && (
                <Chip
                  size="small"
                  label={`Sort: ${
                    SORT_OPTIONS.find(
                      (o) =>
                        o.sortBy === params.sortBy &&
                        o.sortOrder === params.sortOrder
                    )?.label || `${params.sortBy} (${params.sortOrder || "asc"})`
                  }`}
                  onDelete={() => {
                    change({ sortBy: "", sortOrder: "", page: 1 });
                  }}
                />
              )}
              {params.search && (
                <Chip
                  size="small"
                  label={`Search: ${params.search}`}
                  onDelete={() => {
                    setSearch("");
                    change({ search: "", page: 1 });
                  }}
                />
              )}
              {Object.entries(filterOptions)
                .filter(([key]) => params[key])
                .map(([key, option]) => (
                  <Chip
                    key={key}
                    size="small"
                    label={`${option.label}: ${
                      option.values.find(([v]) => v === params[key])?.[1]
                    }`}
                    onDelete={() => change({ [key]: "", page: 1 })}
                  />
                ))}
            </div>
          )}
        </div>
        {query.isError ? (
          <DashboardErrorState
            title="Unable to load customers"
            message={query.error.message}
            onRetry={() => {
              query.refetch();
              if (summaryQuery.isError) summaryQuery.refetch();
            }}
          />
        ) : query.isLoading ? (
          <div className="customer-skeleton">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} height={65} />
            ))}
          </div>
        ) : !data?.items.length ? (
          <div className="customer-empty">
            <GroupOutlined />
            <h2>
              {filtered ? "No matching records found" : "No customers found"}
            </h2>
            <p>
              {filtered
                ? "No customers match your current search or filters."
                : "Add your first customer to start billing."}
            </p>
            <Button
              variant="outlined"
              onClick={() =>
                filtered ? reset() : navigate("/customers/create")
              }
            >
              {filtered ? "Clear Filters" : "Create Customer"}
            </Button>
          </div>
        ) : (
          <>
            <TableContainer className={`customer-table${cardView === "inactive" ? " is-inactive-view" : ""}`}>
              <Table size="small" aria-label="Customer directory">
                <TableHead>
                  <TableRow>
                    {columns.map(([key, label], index) => (
                      <TableCell
                        key={index}
                        sortDirection={
                          params.sortBy === key ? params.sortOrder : false
                        }
                        align={key === "outstandingBalance" ? "right" : "left"}
                      >
                        {["customerCode", "name"].includes(key) ? (
                          <TableSortLabel
                            disabled={!customerCapabilities.sorting}
                            active={!!params.sortBy && params.sortBy === key}
                            direction={
                              params.sortBy === key ? params.sortOrder : "asc"
                            }
                            onClick={() =>
                              customerCapabilities.sorting &&
                              change({
                                sortBy: key,
                                sortOrder:
                                  params.sortBy === key &&
                                  params.sortOrder === "asc"
                                    ? "desc"
                                    : "asc",
                                page: 1,
                              })
                            }
                          >
                            {label}
                          </TableSortLabel>
                        ) : (
                          label || (
                            <span className="customer-sr-only">Actions</span>
                          )
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleCustomers.map((customer) => (
                    <TableRow hover key={customer.id}>
                      <TableCell data-label="Code">
                        <span className="customer-code">
                          {(customer.customerCode || "").trim() || "—"}
                        </span>
                      </TableCell>
                      <TableCell data-label="Customer">
                        <div className="customer-identity">
                          <Avatar
                            className={`customer-avatar tone-${
                              Number((customer.customerCode || "").slice(-1)) %
                              3
                            }`}
                          >
                            {(customer.name || "")
                              .split(" ")
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join("")}
                          </Avatar>
                          <div>
                            <Link to={`/customers/${customer.id}`}>
                              {(customer.name || "").trim() || "—"}
                            </Link>
                            <small>
                              {(customer.companyName || "").trim() || "—"}
                            </small>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell data-label="Type">
                        <span className="customer-type">
                          {customer.customerType || "—"}
                        </span>
                      </TableCell>
                      <TableCell data-label="Tax ID">
                        <div className="customer-tax">
                          <small>
                            {(customer.gstin || "").trim()
                              ? "GSTIN"
                              : (customer.taxId || "").trim()
                              ? "PAN / Tax ID"
                              : "—"}
                          </small>
                          {(customer.gstin || "").trim() ||
                            (customer.taxId || "").trim() ||
                            "—"}
                        </div>
                      </TableCell>
                      <TableCell data-label="Contact">
                        <div className="customer-contact">
                          {(customer.email || "").trim() ? (
                            <a href={`mailto:${(customer.email || "").trim()}`}>
                              {customer.email}
                            </a>
                          ) : (
                            <span>—</span>
                          )}
                          <small>{(customer.mobile || "").trim() || "—"}</small>
                        </div>
                      </TableCell>
                      <TableCell data-label="Outstanding" align="right">
                        <strong
                          className={
                            (customer.outstandingBalance ?? 0) > 0
                              ? "customer-balance due"
                              : "customer-balance"
                          }
                        >
                          {moneyWithCurrency(
                            customer.outstandingBalance,
                            customer.currency
                          )}
                        </strong>
                        <Link className="customer-detail-link" to={`/customers/${customer.id}?tab=invoices`}>View invoices</Link>
                        {cardView === "outstanding" && <CustomerCardDetails customerId={customer.id} view="outstanding" />}
                      </TableCell>
                      <TableCell data-label="Status">
                        <div className="customer-status-details">
                          <StatusChip status={customer.status} />
                          {customer.status === "inactive" && (
                            <Button
                              className="customer-reason-trigger"
                              size="small"
                              aria-label={`View deactivation reason for ${customer.name}`}
                              aria-haspopup="dialog"
                              onClick={() => setInactiveDetails(customer)}
                            >
                              View reason
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell data-label="Actions">
                        <div
                          className="customer-row-actions"
                          role="group"
                          aria-label={`Actions for ${customer.name}`}
                        >
                          <Tooltip title="View details">
                            <IconButton
                              className="action-view"
                              size="small"
                              aria-label={`View ${customer.name}`}
                              component={Link}
                              to={`/customers/${encodeURIComponent(customer.id)}`}
                            >
                              <VisibilityOutlined />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit customer">
                            <IconButton
                              className="action-edit"
                              size="small"
                              aria-label={`Edit ${customer.name}`}
                              onClick={() =>
                                navigate(`/customers/${customer.id}/edit`)
                              }
                            >
                              <EditOutlined />
                            </IconButton>
                          </Tooltip>
                          {customer.status === "active" && (
                            <Tooltip title="Deactivate customer">
                              <IconButton
                                className="action-deactivate"
                                size="small"
                                aria-label={`Deactivate ${customer.name}`}
                                onClick={() => {
                                  mutation.reset();
                                  setReason("");
                                  setConfirm(customer);
                                }}
                              >
                                <PersonOffOutlined />
                              </IconButton>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <footer className="customer-pagination">
              <span role="status">
                Showing{" "}
                {data.totalCount ? (data.page - 1) * data.pageSize + 1 : 0}
                &ndash;{Math.min(data.page * data.pageSize, data.totalCount)} of{" "}
                {data.totalCount} customers
              </span>
              <TextField
                disabled={query.isFetching}
                select
                size="small"
                label="Rows per page"
                value={params.pageSize}
                onChange={(event) =>
                  change({ pageSize: event.target.value, page: 1 })
                }
              >
                {[10, 25, 50, 100].map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </TextField>
              <Pagination
                aria-label="Customer pages"
                count={Math.max(1, data.totalPages)}
                page={data.page}
                onChange={(_, page) => change({ page })}
                disabled={query.isFetching}
                shape="rounded"
                color="primary"
                renderItem={(item) => (
                  <PaginationItem
                    {...item}
                    slots={{
                      previous: () => <span>Previous</span>,
                      next: () => <span>Next</span>,
                    }}
                  />
                )}
              />
            </footer>
          </>
        )}
      </section>
      <Dialog
        className="customer-reason-dialog"
        open={!!inactiveDetails}
        onClose={() => setInactiveDetails(null)}
        aria-labelledby="customer-reason-title"
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle id="customer-reason-title">Deactivation details</DialogTitle>
        <DialogContent>
          <div className="customer-reason-profile">
            <strong>{inactiveDetails?.name}</strong>
            <span>{inactiveDetails?.customerCode}</span>
          </div>
          {inactiveDetails && (
            <CustomerCardDetails key={inactiveDetails.id} customerId={inactiveDetails.id} view="inactive" compact />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInactiveDetails(null)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!confirm}
        onClose={() => !mutation.isPending && setConfirm(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Deactivate Customer?</DialogTitle>
        <DialogContent>
          <p>Are you sure you want to deactivate “{confirm?.name}”?</p>
          <p className="customer-dialog-note">
            The customer will become inactive. Existing invoices, payments and
            historical records will be preserved.
          </p>
          <TextField autoFocus fullWidth required multiline minRows={2} margin="normal" label="Reason for deactivation" value={reason} inputProps={{ maxLength: 500 }} onChange={(event) => setReason(event.target.value)} />
          {mutation.isError && (
            <Alert severity="error">
              Unable to update customer. {mutation.error?.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={mutation.isPending}
            onClick={() => setConfirm(null)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={mutation.isPending || !reason.trim()}
            onClick={() => {
              if (!confirm || statusLock.current) return;
              statusLock.current = true;
              mutation.mutate({ ...confirm, reason: reason.trim() }, {
                onSuccess: () => {
                  setNotice(`Customer deactivated successfully.`);
                  setConfirm(null);
                },
                onSettled: () => {
                  statusLock.current = false;
                },
              });
            }}
          >
            {mutation.isPending ? "Saving…" : "Deactivate"}
          </Button>
        </DialogActions>
      </Dialog>
      <FeedbackSnackbar message={notice} onClose={() => setNotice('')} />
    </main>
  );
}
