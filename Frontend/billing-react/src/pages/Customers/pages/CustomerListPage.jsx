import { useNavbarSearch } from '../../../hooks/useNavbarSearch';
import { SearchField } from '../../../components/SearchField';
import { hasPermission } from "../../../utils/permissionUtils";
import { printCustomerList } from '../utils/customerReports';
import { CustomerCardDetails } from "../components/CustomerCardDetails";
import { CustomerEmailLink } from "../components/CustomerEmailLink";
import { FeedbackSnackbar } from '../../../components/FeedbackSnackbar';
import { FilterSelectField } from '../../../components/FilterSelectField';
import { WorkspacePagination } from '../../../components/WorkspacePagination';
import { useProductSelectProps } from '../../Products/components/ProductSelect';
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import TextField from '@mui/material/TextField';
import Add from '@mui/icons-material/Add';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined';
import Search from '@mui/icons-material/Search';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import MoreVert from '@mui/icons-material/MoreVert';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import {
  useCustomers,
  useCustomerStatus,
  useCustomerSummary,
} from "../hooks/useCustomers";

import { customerCapabilities } from "../api/customerContract";
import { useSearchCommit } from "../../../hooks/useSearchDebounce";
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
    <span>NA</span>
  ) : (
    <span className={`customer-status ${status}`}>
      <i />
      {status}
    </span>
  );
const moneyWithCurrency = (value, currency) => {
  if (value == null || !Number.isFinite(value) || !currency?.trim()) return "NA";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency.trim().toUpperCase(),
      currencyDisplay: "symbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return "NA";
  }
};
const filterOptions = {
  customerType: {
    label: "Customer Type",
    allLabel: "All Types",
    values: [
      ["Individual", "Individual"],
      ["Business", "Business"],
      ["Organization", "Organization"],
    ],
  },
  taxRegistration: {
    label: "Tax Registration",
    allLabel: "All Tax Registration",
    values: [
      ["Registered", "Registered"],
      ["Unregistered", "Unregistered"],
    ],
  },
  outstanding: {
    label: "Outstanding",
    allLabel: "All Outstanding",
    values: [
      ["Has Outstanding", "Has Outstanding"],
      ["No Outstanding", "No Outstanding"],
    ],
  },
  status: {
    label: "Status",
    allLabel: "All Statuses",
    values: [
      ["active", "Active"],
      ["inactive", "Inactive"],
    ],
  },
};
const columns = [
  ["customerCode", "Customer code"],
  ["customerType", "Type"],
  ["name", "Customer"],
  ["", "Tax ID / GSTIN"],
  ["outstandingBalance", "Outstanding"],
  ["status", "Status"],
  ["", "Contact"],
  ["", "Actions"],
];

const SORT_OPTIONS = [
  { label: "Recently Added", sortBy: "createdAt", sortOrder: "desc" },
  { label: "Alphabetical (A-Z)", sortBy: "name", sortOrder: "asc" },
  { label: "Alphabetical (Z-A)", sortBy: "name", sortOrder: "desc" },
  { label: "Customer Code (A-Z)", sortBy: "customerCode", sortOrder: "asc" },
  { label: "Customer Code (Z-A)", sortBy: "customerCode", sortOrder: "desc" },
  { label: "First Added", sortBy: "id", sortOrder: "asc" },
  { label: "Last Added", sortBy: "id", sortOrder: "desc" },
];

function getSortValue(sortBy, sortOrder) {
  const match = SORT_OPTIONS.find((item) => item.sortBy === sortBy && item.sortOrder === sortOrder);
  return match ? `${match.sortBy}:${match.sortOrder}` : "";
}

const ALLOWED_SORT_FIELDS = [
  "customerCode",
  "name",
  "createdAt",
  "id",
  "email",
  "companyName",
  "code",
  "updatedAt",
];

export const CustomerRowActions = ({
  customer,
  onDeactivate,
  onViewReason,
}) => {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);
  const handleOpen = (event) => setAnchor(event.currentTarget);
  const handleClose = () => setAnchor(null);

  return (
    <div className="customer-row-actions">
      <IconButton
        className="ibms-row-actions-trigger" aria-haspopup="menu" aria-expanded={open}
        aria-label={`Actions for customer ${customer.name || customer.customerCode || customer.id}`}

        size="small"
        onClick={handleOpen}
      >
        <MoreVert fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ className: "customer-actions-menu ibms-row-actions-menu" }}
      >
        <MenuItem
          onClick={() => {
            handleClose();
            navigate(`/customers/${encodeURIComponent(customer.id)}`);
          }}
        >
          <ListItemIcon>
            <VisibilityOutlined fontSize="small" />
          </ListItemIcon>
          View Details
        </MenuItem>
        {(hasPermission('customers.edit') || hasPermission('customers.manage')) && <MenuItem
          onClick={() => {
            handleClose();
            navigate(`/customers/${customer.id}/edit`);
          }}
        >
          <ListItemIcon>
            <EditOutlined fontSize="small" />
          </ListItemIcon>
          Edit Customer
        </MenuItem>}
        {customer.status === "active" && (hasPermission('customers.delete') || hasPermission('customers.manage')) && (
          <MenuItem className="is-destructive"
            onClick={() => {
              handleClose();
              onDeactivate(customer);
            }}
          >
            <ListItemIcon>
              <PersonOffOutlined fontSize="small" />
            </ListItemIcon>
            Deactivate Customer
          </MenuItem>
        )}
        {customer.status === "inactive" && onViewReason && (
          <MenuItem
            onClick={() => {
              handleClose();
              onViewReason(customer);
            }}
          >
            <ListItemIcon>
              <InfoOutlined fontSize="small" />
            </ListItemIcon>
            View Reason
          </MenuItem>
        )}
      </Menu>
    </div>
  );
};

export function CustomerListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const summaryQuery = useCustomerSummary();
  const [url, setUrl] = useSearchParams();
  const sortSelectProps = useProductSelectProps();
  const params = {
    page: Math.max(1, Number(url.get("page")) || 1),
    pageSize: [5, 10, 20, 50].includes(Number(url.get("pageSize")))
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
    const option = SORT_OPTIONS.find((item) => `${item.sortBy}:${item.sortOrder}` === value);
    if (option) change({ sortBy: option.sortBy, sortOrder: option.sortOrder, page: 1 });
  };
  const [search, setSearch] = useState(params.search);
  useNavbarSearch(search, setSearch, 'Search customers');
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
  useEffect(() => setSearch(params.search), [params.search]);
  useSearchCommit(search.trim(), (nextSearch) => {
    if (nextSearch !== params.search) change({ search: nextSearch, page: 1 });
  });
  const query = useCustomers(params);
  const mutation = useCustomerStatus();
  const statusLock = useRef(false);
  const [confirm, setConfirm] = useState(null);
  const [inactiveDetails, setInactiveDetails] = useState(null);
  const [reason, setReason] = useState("");
  const [outstandingDetails, setOutstandingDetails] = useState(null);
  const cardView = params.outstanding === "Has Outstanding" ? "outstanding" : params.status || "total";
  const customerTableRef = useRef(null);
  useEffect(() => {
    if (cardView === "outstanding" && customerTableRef.current) customerTableRef.current.scrollLeft = 0;
  }, [cardView]);
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
      <Breadcrumbs className="customers-breadcrumb" aria-label="Breadcrumb">
        <span>Billing</span>
        <strong aria-current="page">Customers</strong>
      </Breadcrumbs>
      <header className="customers-heading">
        <div>
          <h1>Customers</h1>
          <p>
            Manage customer profiles, billing information and account activity.
          </p>
        </div>
        <div className="customers-heading-actions">

            <Button
              aria-label="Print current customer page"
              onClick={() => printCustomerList(visibleCustomers)}
              variant="outlined"
              startIcon={<PrintOutlined />}
            >
              Print
            </Button>

          {(hasPermission('customers.create') || hasPermission('customers.manage')) && <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate("/customers/create")}
          >
            Create Customer
          </Button>}
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
              {cardView === "inactive" ? "Inactive customers and reasons" : cardView === "active" ? "Active customers" : cardView === "outstanding" ? "Outstanding by customer and invoice" : "Customer directory"}
            </h2>
            <p>{cardView === "inactive" ? "Review each inactive profile, its recorded reason and deactivation details." : cardView === "outstanding" ? "Unpaid invoices are listed by due date, earliest first." : "Select a customer name to view their profile and transactions."}</p>
          </div>
        </div>
        <div className="customer-filters">
          <SearchField
            disabled={!customerCapabilities.search}
            className="customer-search"
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or code"
            searchHint="Search by customer name, code, email or mobile."
            inputProps={{ "aria-label": "Search customers" }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
          <div className="customer-filter-row">
            <FilterSelectField
              select
              size="small"
              SelectProps={{ ...sortSelectProps, displayEmpty: true }}
              inputProps={{ "aria-label": "Sort customers" }}
              value={sortValue}
              onChange={(event) => handleSortChange(event.target.value)}
              className="customer-sort-select"
            >
              <MenuItem value="">Sort By</MenuItem>
              {SORT_OPTIONS.map((option) => (
                <MenuItem
                  key={`${option.sortBy}:${option.sortOrder}`}
                  value={`${option.sortBy}:${option.sortOrder}`}
                >
                  {option.label}
                </MenuItem>
              ))}
            </FilterSelectField>
            {Object.entries(filterOptions).map(([key, option]) => (
              <FilterSelectField
                select
                size="small"
                key={key}
                inputProps={{ "aria-label": `Filter customers by ${option.label.toLowerCase()}` }}
                value={params[key] || ""}
                onChange={(event) => change({ [key]: event.target.value, page: 1 })}
              >
                <MenuItem value="">{option.allLabel || "All"}</MenuItem>
                {option.values.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </FilterSelectField>
            ))}
            <Button onClick={reset} disabled={!filtered && !search && !url.toString()}>
              Reset filters
            </Button>
          </div>
          {filtered && <div className="customer-filter-chips">
            {params.sortBy && <Chip size="small" label={`Sort: ${SORT_OPTIONS.find((option) => option.sortBy === params.sortBy && option.sortOrder === params.sortOrder)?.label || `${params.sortBy} (${params.sortOrder || "asc"})`}`} onDelete={() => change({ sortBy: "", sortOrder: "", page: 1 })} />}
            {params.search && <Chip size="small" label={`Search: ${params.search}`} onDelete={() => { setSearch(""); change({ search: "", page: 1 }); }} />}
            {Object.entries(filterOptions).filter(([key]) => params[key]).map(([key, option]) => <Chip key={key} size="small" label={`${option.label}: ${option.values.find(([value]) => value === params[key])?.[1]}`} onDelete={() => change({ [key]: "", page: 1 })} />)}
          </div>}
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
                ? "No customers match the selected customer view."
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
            <TableContainer ref={customerTableRef} className={`ibms-table-frame customer-table${cardView === "inactive" ? " is-inactive-view" : ""}${cardView === "outstanding" ? " is-outstanding-view" : ""}`}>
              <Table size="small" aria-label="Customer directory">
                <TableHead>
                  <TableRow>
                    {columns.map(([key, label], index) => (
                      <TableCell
                        key={index}
                        sortDirection={
                          Boolean(key) && params.sortBy === key
                            ? params.sortOrder || "asc"
                            : false
                        }
                        align={label === "Actions" ? "center" : "left"}
                      >
                        <div className={key === 'name' ? 'customer-name-heading' : label === 'Contact' ? 'customer-contact-heading' : undefined}>
                        {["customerCode", "name"].includes(key) ? (
                          <TableSortLabel
                            disabled={!customerCapabilities.sorting}
                            active={!!params.sortBy && params.sortBy === key}
                            direction={
                              params.sortBy === key ? params.sortOrder || "asc" : "asc"
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
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleCustomers.map((customer) => (
                    <TableRow hover key={customer.id}>
                      <TableCell data-label="Code">
                        <span className="customer-code">
                          {(customer.customerCode || "").trim() || "NA"}
                        </span>
                      </TableCell>
                      <TableCell data-label="Type">
                        <span className="customer-type">
                          {(customer.customerType || customer.CustomerType || "").trim() || "NA"}
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
                          <div className="customer-identity-copy">
                            <Link to={`/customers/${customer.id}`} title={(customer.name || '').trim()}>
                              {(customer.name || "").trim() || "NA"}
                            </Link>
                            <small title={(customer.companyName || '').trim()}>
                              {(customer.companyName || "").trim() || "NA"}
                            </small>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell data-label="Tax ID">
                        <div className="customer-tax">
                          {(customer.gstin || "").trim() || (customer.taxId || "").trim() ? (
                            <>
                              <small>
                                {(customer.gstin || "").trim()
                                  ? "GSTIN"
                                  : "PAN / Tax ID"}
                              </small>
                              <span>
                                {(customer.gstin || "").trim() ||
                                  (customer.taxId || "").trim()}
                              </span>
                            </>
                          ) : (
                            <span>NA</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell data-label="Outstanding" align="left">
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
                          {cardView === "outstanding" && (
                            <Button
                              className="customer-reason-trigger"
                              size="small"
                              aria-haspopup="dialog"
                              onClick={() => setOutstandingDetails(customer)}
                            >
                              View outstanding
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell data-label="Contact">
                        <div className="customer-contact">
                          {(customer.email || "").trim() ? (
                            <CustomerEmailLink email={customer.email} />
                          ) : (
                            <span>NA</span>
                          )}
                          {(customer.mobile || "").trim() && (customer.mobile || "").trim() !== "NA" ? (
                            <small>{(customer.mobile || "").trim()}</small>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell data-label="Actions" align="center">
                        <CustomerRowActions
                          customer={customer}
                          onDeactivate={(c) => {
                            mutation.reset();
                            setReason("");
                            setConfirm(c);
                          }}
                          onViewReason={(c) => setInactiveDetails(c)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <WorkspacePagination
              page={data.page}
              pageSize={params.pageSize}
              totalCount={data.totalCount}
              itemLabel="customers"
              disabled={query.isFetching}
              onPageChange={(page) => change({ page })}
              onPageSizeChange={(pageSize) => change({ pageSize, page: 1 })}
            />
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
        className="customer-reason-dialog customer-outstanding-dialog"
        open={!!outstandingDetails}
        onClose={() => setOutstandingDetails(null)}
        aria-labelledby="customer-outstanding-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="customer-outstanding-title">Outstanding invoices</DialogTitle>
        <DialogContent>
          <div className="customer-reason-profile">
            <strong>{outstandingDetails?.name}</strong>
            <span>{outstandingDetails?.customerCode}</span>
          </div>
          {outstandingDetails && <CustomerCardDetails key={outstandingDetails.id} customerId={outstandingDetails.id} view="outstanding" />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOutstandingDetails(null)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        className="customer-deactivate-dialog"
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
          <TextField autoFocus fullWidth required multiline minRows={2} margin="normal" placeholder="Reason for deactivation" value={reason} inputProps={{ maxLength: 500, "aria-label": "Reason for deactivation" }} onChange={(event) => setReason(event.target.value)} />
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
