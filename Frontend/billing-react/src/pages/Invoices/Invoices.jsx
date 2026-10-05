import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Add,
  DownloadOutlined,
  ReceiptLongOutlined,
  SendOutlined,
  PieChartOutline,
  WarningAmberOutlined,
  CheckCircleOutline,
  Search,
  FilterList,
  MoreVert,
  VisibilityOutlined,
  EditOutlined,
  PaymentsOutlined,
  PrintOutlined,
  PictureAsPdfOutlined,
  RefreshOutlined,
} from '@mui/icons-material';
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
  Button,
} from '@mui/material';
import { DashboardHeader } from '../../components/dashboard/DashboardHeader';
import { invoiceApi, customerApi } from 'billing-api-client';
import { InvoicePreviewModal } from './components/InvoicePreviewModal';
import { RecordPaymentModal } from './components/RecordPaymentModal';
import '../../styles/Invoices.css';

const statuses = [
  'All Invoices',
  'Draft',
  'Issued',
  'Partially Paid',
  'Paid',
  'Overdue',
  'Cancelled',
  'Void',
];

const title = (value = 'draft') =>
  String(value || '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const statusOf = (invoice) => title(invoice?.status || 'Draft');

const paymentOf = (invoice) => {
  if (!invoice) return 'Pending';
  if (invoice.paymentStatus) return title(invoice.paymentStatus);
  const s = statusOf(invoice);
  if (s === 'Paid') return 'Paid';
  if (s === 'Partially Paid') return 'Partially Paid';
  if (s === 'Overdue') return 'Overdue';
  if (s === 'Draft') return 'Not Paid';
  return 'Pending';
};

export const resolveCustomerName = (inv) => {
  if (typeof inv?.customerName === 'string' && inv.customerName.trim()) return inv.customerName.trim();
  if (typeof inv?.customer === 'string' && inv.customer.trim()) return inv.customer.trim();
  if (inv?.customer && typeof inv.customer === 'object') {
    return (
      inv.customer.companyName ||
      inv.customer.name ||
      inv.customer.displayName ||
      `${inv.customer.firstName || ''} ${inv.customer.lastName || ''}`.trim() ||
      'Unnamed Customer'
    );
  }
  return 'Unnamed Customer';
};

export const resolveCustomerMeta = (inv) => {
  if (typeof inv?.customerEmail === 'string' && inv.customerEmail.trim()) return inv.customerEmail.trim();
  if (typeof inv?.email === 'string' && inv.email.trim()) return inv.email.trim();
  if (inv?.customer && typeof inv.customer === 'object') {
    if (typeof inv.customer.email === 'string' && inv.customer.email.trim()) return inv.customer.email.trim();
    if (inv.customer.customerCode) return `Code: ${inv.customer.customerCode}`;
  }
  if (inv?.customerId && typeof inv.customerId !== 'object') return `ID: ${inv.customerId}`;
  return '';
};

export const getInitials = (name = '') => {
  if (!name || typeof name !== 'string') return 'C';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const getAvatarColor = (name = '') => {
  const colors = [
    { bg: '#fbf0e4', text: '#7c3a0e' },
    { bg: '#eef4ff', text: '#1e40af' },
    { bg: '#ecfdf5', text: '#065f46' },
    { bg: '#fef3c7', text: '#92400e' },
    { bg: '#f3e8ff', text: '#6b21a8' },
    { bg: '#ffe4e6', text: '#9f1239' },
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = (name || '').charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const formatCurrency = (val, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 2,
  }).format(Number(val || 0));

const formatDate = (val) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val).slice(0, 10);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return String(val).slice(0, 10);
  }
};

const initialFilters = {
  search: '',
  start: '',
  end: '',
  customerId: '',
  status: '',
};

export const Invoices = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // State initialized with invoices
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [backendSummary, setBackendSummary] = useState(null);

  // Filters & Pagination
  const [tab, setTab] = useState(() => {
    const param = searchParams.get('status');
    return statuses.includes(param) ? param : 'All Invoices';
  });
  const [filters, setFilters] = useState(initialFilters);
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState({ key: 'issueDate', direction: -1 });

  // Action Menu & Modals
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuInvoice, setMenuInvoice] = useState(null);
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [paymentInvoice, setPaymentInvoice] = useState(null);

  // Fetch Invoices with authoritative server pagination and filters
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, summaryRes] = await Promise.allSettled([
        invoiceApi.getInvoices({
          page,
          pageSize,
          search: filters.search,
          customerId: filters.customerId,
          status: tab === 'All Invoices' ? undefined : tab,
          startDate: filters.start,
          endDate: filters.end,
        }),
        invoiceApi.getSummary(),
      ]);

      if (res.status === 'fulfilled') {
        const data = res.value;
        const items = Array.isArray(data) ? data : data?.items || [];
        setInvoices(items);
        setTotalCount(data?.totalCount ?? items.length);
        setTotalPages(data?.totalPages ?? Math.max(1, Math.ceil((data?.totalCount ?? items.length) / pageSize)));
      } else {
        throw res.reason;
      }

      if (summaryRes.status === 'fulfilled' && summaryRes.value) {
        setBackendSummary(summaryRes.value);
      }
    } catch (err) {
      console.warn('Backend invoices sync error:', err);
      setError(err?.message || 'Unable to load invoices from server.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters.search, filters.customerId, filters.start, filters.end, tab]);

  // Fetch Customers for filter dropdown
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await customerApi.getCustomers({ pageSize: 200 });
        const list = Array.isArray(res) ? res : res?.items || [];
        if (active && list.length > 0) {
          setCustomers(list);
        }
      } catch (err) {
        console.warn('Unable to load customer list for filters:', err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const customerOptions = useMemo(() => {
    if (customers.length > 0) {
      return customers.map((c) => ({
        id: String(c.id ?? ''),
        name: typeof c === 'string' ? c : (c.companyName || c.name || c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed Customer'),
      }));
    }
    const unique = [...new Set(invoices.map((inv) => resolveCustomerName(inv)).filter(Boolean))];
    return unique.map((name) => ({ id: name, name }));
  }, [customers, invoices]);

  const matchesStatus = (invoice, targetStatus) => {
    if (!targetStatus || targetStatus === 'All Invoices') return true;
    if (!invoice) return false;
    const invStatus = statusOf(invoice);
    if (invStatus.toLowerCase() === targetStatus.toLowerCase()) return true;
    if (targetStatus === 'Issued' && invStatus.toLowerCase() === 'sent') return true;
    return false;
  };

  const count = (status) => {
    if (status === 'All Invoices' && totalCount > 0) return totalCount;
    return invoices.filter((invoice) => matchesStatus(invoice, status)).length;
  };

  const total = (status) => {
    if (status === 'All Invoices' && backendSummary?.totalInvoiced != null) {
      return formatCurrency(backendSummary.totalInvoiced);
    }
    return formatCurrency(
      invoices
        .filter((invoice) => matchesStatus(invoice, status))
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount ?? invoice.total ?? 0), 0)
    );
  };

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const rows = useMemo(() => {
    let list = invoices;
    if (filters.currency) {
      list = list.filter((inv) => (inv.currency || 'INR').toUpperCase() === filters.currency.toUpperCase());
    }
    if (filters.onlyOutstanding) {
      list = list.filter((inv) => Number(inv.balanceAmount ?? (Number(inv.totalAmount ?? inv.total ?? 0) - Number(inv.paidAmount ?? 0))) > 0);
    }

    return list.slice().sort((a, b) => {
      const keyA =
        sort.key === 'total'
          ? Number(a.totalAmount ?? a.total ?? 0)
          : String(a[sort.key] || a.invoiceDate || a.issueDate || '');
      const keyB =
        sort.key === 'total'
          ? Number(b.totalAmount ?? b.total ?? 0)
          : String(b[sort.key] || b.invoiceDate || b.issueDate || '');

      if (sort.key === 'total') {
        return sort.direction * (keyA - keyB);
      }
      return sort.direction * String(keyA).localeCompare(String(keyB));
    });
  }, [invoices, filters.currency, filters.onlyOutstanding, sort]);

  const visible = rows;

  const toggle = (id) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );

  const exportRows = (items) => {
    const cell = (value) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const headers = [
      'Invoice #',
      'Customer',
      'Invoice Date',
      'Due Date',
      'Subtotal',
      'Tax',
      'Total Amount',
      'Amount Paid',
      'Outstanding Balance',
      'Status',
      'Payment Status',
    ];
    const csvRows = items.map((inv) => [
      inv.invoiceNumber || inv.id,
      resolveCustomerName(inv),
      (inv.invoiceDate || inv.issueDate || '').slice(0, 10),
      (inv.dueDate || '').slice(0, 10),
      Number(inv.subtotal ?? (Number(inv.total || 0) - Number(inv.tax || 0))).toFixed(2),
      Number(inv.taxAmount ?? inv.tax ?? 0).toFixed(2),
      Number(inv.totalAmount ?? inv.total ?? 0).toFixed(2),
      Number(inv.paidAmount ?? 0).toFixed(2),
      Number(inv.balanceAmount ?? (Number(inv.total || 0) - Number(inv.paidAmount || 0))).toFixed(2),
      statusOf(inv),
      paymentOf(inv),
    ]);

    const csvContent = [headers, ...csvRows].map((row) => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoices_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Action Menu Timer for smooth mouse-hover and click interaction
  const menuTimerRef = useRef(null);

  const handleOpenMenu = (event, invoice) => {
    if (menuTimerRef.current) {
      clearTimeout(menuTimerRef.current);
      menuTimerRef.current = null;
    }
    setMenuAnchor(event.currentTarget);
    setMenuInvoice(invoice);
  };

  const handleCloseMenu = () => {
    if (menuTimerRef.current) {
      clearTimeout(menuTimerRef.current);
      menuTimerRef.current = null;
    }
    setMenuAnchor(null);
    setMenuInvoice(null);
  };

  const handleScheduleCloseMenu = () => {
    if (menuTimerRef.current) {
      clearTimeout(menuTimerRef.current);
    }
    menuTimerRef.current = setTimeout(() => {
      setMenuAnchor(null);
      setMenuInvoice(null);
    }, 240);
  };

  const handleCancelCloseMenu = () => {
    if (menuTimerRef.current) {
      clearTimeout(menuTimerRef.current);
      menuTimerRef.current = null;
    }
  };

  const handleToggleMenuOnClick = (event, inv) => {
    if (menuTimerRef.current) {
      clearTimeout(menuTimerRef.current);
      menuTimerRef.current = null;
    }
    const currentId = menuInvoice?.id || menuInvoice?.invoiceNumber;
    const targetId = inv?.id || inv?.invoiceNumber;
    if (menuAnchor && currentId === targetId) {
      handleCloseMenu();
    } else {
      setMenuAnchor(event.currentTarget);
      setMenuInvoice(inv);
    }
  };

  useEffect(() => {
    return () => {
      if (menuTimerRef.current) {
        clearTimeout(menuTimerRef.current);
      }
    };
  }, []);

  const cards = [
    ['All Invoices', 'Total Invoices', ReceiptLongOutlined, 'sand'],
    ['Draft', 'Draft', ReceiptLongOutlined, 'amber'],
    ['Issued', 'Issued', SendOutlined, 'blue'],
    ['Partially Paid', 'Partially Paid', PieChartOutline, 'amber'],
    ['Overdue', 'Overdue', WarningAmberOutlined, 'red'],
    ['Paid', 'Paid', CheckCircleOutline, 'green'],
  ];

  return (
    <div className="invoice-module">
      <DashboardHeader
        searchQuery={filters.search}
        onSearch={(value) => updateFilter('search', value)}
        onSignOut={() => {
          localStorage.removeItem('billing_auth_token');
          localStorage.removeItem('billing_auth_user');
          navigate('/login');
        }}
      />
      <main className="inv-main">
        {/* Breadcrumb */}
        <div className="inv-breadcrumb">
          <button onClick={() => navigate('/dashboard')}>Home</button>
          <span>›</span>
          <strong>Invoices</strong>
        </div>

        {/* Heading & Top Actions */}
        <div className="inv-heading">
          <div className="inv-heading-copy">
            <span className="inv-title-icon">
              <ReceiptLongOutlined />
            </span>
            <div>
              <h1>Invoices</h1>
              <p>Create, manage, track, and record payments for all enterprise invoices</p>
            </div>
          </div>
          <div className="inv-actions">
            <button onClick={fetchInvoices} title="Refresh invoice list">
              <RefreshOutlined fontSize="small" />
              Refresh
            </button>
            <button onClick={() => exportRows(rows)} disabled={!rows.length}>
              <DownloadOutlined />
              Export
            </button>
            <button className="inv-primary" onClick={() => navigate('/invoices/new')}>
              <Add />
              Create Invoice
            </button>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <section className="inv-summary" aria-label="Invoice summary">
          {cards.map(([status, label, Icon, tone]) => (
            <button
              className={`inv-summary-card ${tab === status ? 'active' : ''}`}
              key={status}
              onClick={() => {
                setTab(status);
                setPage(1);
              }}
            >
              <span className={`inv-summary-icon ${tone}`}>
                <Icon />
              </span>
              <span className="inv-summary-content">
                <span className="inv-summary-label">{label}</span>
                <strong className="inv-summary-count">{count(status)}</strong>
                <small className="inv-summary-total">{total(status)}</small>
              </span>
            </button>
          ))}
        </section>

        {/* Main Panel */}
        <section className="inv-panel">
          {/* Status Tabs */}
          <div className="inv-tabs" aria-label="Invoice status">
            {statuses.map((status) => (
              <button
                key={status}
                className={tab === status ? 'active' : ''}
                aria-pressed={tab === status}
                onClick={() => {
                  setTab(status);
                  setPage(1);
                }}
              >
                {status}
                <span className="inv-tab-count">{count(status)}</span>
              </button>
            ))}
          </div>

          {/* Filters Form */}
          <form
            className="inv-filters"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
            }}
          >
            <label className="inv-search">
              <Search />
              <input
                aria-label="Search invoices"
                placeholder="Search by invoice #, customer, amount..."
                value={filters.search}
                onChange={(event) => updateFilter('search', event.target.value)}
              />
            </label>
            <label>
              From Date
              <input
                type="date"
                value={filters.start}
                onChange={(event) => updateFilter('start', event.target.value)}
              />
            </label>
            <label>
              To Date
              <input
                type="date"
                min={filters.start}
                value={filters.end}
                onChange={(event) => updateFilter('end', event.target.value)}
              />
            </label>
            <label>
              Customer
              <select
                value={filters.customerId}
                onChange={(event) => updateFilter('customerId', event.target.value)}
              >
                <option value="">All Customers</option>
                {customerOptions.map((c) => (
                  <option key={c.id || c.name} value={c.id || c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={filters.status}
                onChange={(event) => updateFilter('status', event.target.value)}
              >
                <option value="">All Statuses</option>
                {statuses.slice(1).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Currency
              <select
                value={filters.currency || ''}
                onChange={(event) => updateFilter('currency', event.target.value)}
              >
                <option value="">All Currencies</option>
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </label>
            <label>
              Outstanding
              <select
                value={filters.onlyOutstanding ? 'outstanding' : ''}
                onChange={(event) => updateFilter('onlyOutstanding', event.target.value === 'outstanding')}
              >
                <option value="">All</option>
                <option value="outstanding">Outstanding</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setFilters(initialFilters);
                setTab('All Invoices');
                setPage(1);
              }}
            >
              Reset
            </button>
            <button className="inv-primary" type="submit">
              <FilterList />
              Filter
            </button>
          </form>

          {/* Table */}
          <div className="inv-table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="col-th-check">
                    <input
                      type="checkbox"
                      aria-label="Select visible invoices"
                      checked={visible.length > 0 && visible.every((inv) => selected.includes(inv.id || inv.invoiceNumber))}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...new Set([...current, ...visible.map((inv) => inv.id || inv.invoiceNumber)])]
                            : current.filter((id) => !visible.some((inv) => (inv.id || inv.invoiceNumber) === id))
                        )
                      }
                    />
                  </th>
                  {[
                    ['invoiceNumber', 'Invoice #', 'col-th-no'],
                    ['customer', 'Customer', 'col-th-customer'],
                    ['invoiceDate', 'Date', 'col-th-date'],
                    ['dueDate', 'Due', 'col-th-due'],
                    ['subtotal', 'Subtotal', 'col-th-num col-th-subtotal'],
                    ['tax', 'Tax', 'col-th-num col-th-tax'],
                    ['total', 'Total', 'col-th-num col-th-total'],
                    ['paid', 'Paid', 'col-th-num col-th-paid'],
                    ['balance', 'Balance', 'col-th-num col-th-balance'],
                    ['status', 'Status', 'col-th-status'],
                  ].map(([key, label, colClass]) => (
                    <th
                      key={key}
                      className={colClass}
                      aria-sort={
                        sort.key === key ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none'
                      }
                    >
                      <button
                        onClick={() =>
                          setSort({ key, direction: sort.key === key ? -sort.direction : 1 })
                        }
                      >
                        {label} <span className="sort-arrow">{sort.key === key ? (sort.direction === 1 ? '↑' : '↓') : '↕'}</span>
                      </button>
                    </th>
                  ))}
                  <th className="col-th-payment">Payment</th>
                  <th className="col-th-actions" style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={13} style={{ textAlign: 'center', padding: '48px 16px' }}>
                      <CircularProgress size={32} sx={{ color: '#70472f' }} />
                      <div style={{ marginTop: '10px', color: '#685e57', fontWeight: 500 }}>
                        Loading invoices from server...
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={13} style={{ padding: '24px' }}>
                      <Alert
                        severity="error"
                        action={
                          <Button color="inherit" size="small" onClick={fetchInvoices}>
                            Retry
                          </Button>
                        }
                      >
                        Unable to load invoices. {error}
                      </Alert>
                    </td>
                  </tr>
                ) : visible.length > 0 ? (
                  visible.map((inv) => {
                    const invoiceNum = inv.invoiceNumber || inv.id || 'INV-000';
                    const custName = resolveCustomerName(inv);
                    const custMeta = resolveCustomerMeta(inv);
                    const avatarColor = getAvatarColor(custName);
                    const invDate = inv.invoiceDate || inv.issueDate;
                    const subtotalVal = Number(
                      inv.subtotal ?? (Number(inv.totalAmount ?? inv.total ?? 0) - Number(inv.taxAmount ?? inv.tax ?? 0))
                    ) || 0;
                    const taxVal = Number(inv.taxAmount ?? inv.tax ?? 0) || 0;
                    const totalVal = Number(inv.totalAmount ?? inv.total ?? 0) || 0;
                    const paidVal = Number(inv.paidAmount ?? 0) || 0;
                    const balanceVal = Number(inv.balanceAmount ?? (totalVal - paidVal)) || 0;
                    const currency = inv.currency || 'INR';
                    const rowKey = inv.id || invoiceNum;
                    const isMenuOpenForRow = Boolean(menuAnchor) && (menuInvoice?.id === rowKey || menuInvoice?.invoiceNumber === rowKey);

                    return (
                      <tr key={rowKey}>
                        <td className="col-check">
                          <input
                            type="checkbox"
                            aria-label={`Select ${invoiceNum}`}
                            checked={selected.includes(rowKey)}
                            onChange={() => toggle(rowKey)}
                          />
                        </td>
                        <td className="col-no">
                          <button
                            className="inv-no-badge"
                            onClick={() => navigate(`/invoices/${encodeURIComponent(rowKey)}`)}
                            title="Click to view full invoice details"
                          >
                            {invoiceNum}
                          </button>
                        </td>
                        <td className="col-customer">
                          <div className="inv-cust-cell">
                            <span
                              className="inv-cust-avatar"
                              style={{ backgroundColor: avatarColor.bg, color: avatarColor.text }}
                            >
                              {getInitials(custName)}
                            </span>
                            <div className="inv-cust-info">
                              <span className="inv-cust-name" title={custName}>{custName}</span>
                              {custMeta && <span className="inv-cust-meta" title={custMeta}>{custMeta}</span>}
                            </div>
                          </div>
                        </td>
                        <td className="col-date">{formatDate(invDate)}</td>
                        <td className="col-due">{formatDate(inv.dueDate)}</td>
                        <td className="col-subtotal inv-num">{formatCurrency(subtotalVal, currency)}</td>
                        <td className="col-tax inv-num">{formatCurrency(taxVal, currency)}</td>
                        <td className="col-total inv-num inv-num-total">
                          {formatCurrency(totalVal, currency)}
                        </td>
                        <td className="col-paid inv-num inv-num-paid">
                          {formatCurrency(paidVal, currency)}
                        </td>
                        <td className={`col-balance inv-num ${balanceVal > 0 ? 'inv-num-due' : 'inv-num-zero'}`}>
                          {formatCurrency(balanceVal, currency)}
                        </td>
                        <td className="col-status">
                          <span
                            className={`inv-badge inv-status-${statusOf(inv)
                              .toLowerCase()
                              .replace(/ /g, '-')}`}
                          >
                            <span className="inv-badge-dot" />
                            {statusOf(inv)}
                          </span>
                        </td>
                        <td className="col-payment">
                          <span
                            className={`inv-badge inv-payment-${paymentOf(inv)
                              .toLowerCase()
                              .replace(/ /g, '-')}`}
                          >
                            <span className="inv-badge-dot" />
                            {paymentOf(inv)}
                          </span>
                        </td>
                        <td className="col-actions">
                          <button
                            className={`inv-more ${isMenuOpenForRow ? 'active' : ''}`}
                            aria-label={`Options for ${invoiceNum}`}
                            onMouseEnter={(event) => handleOpenMenu(event, inv)}
                            onMouseLeave={handleScheduleCloseMenu}
                            onClick={(event) => handleToggleMenuOnClick(event, inv)}
                          >
                            <MoreVert fontSize="small" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={13} className="inv-empty">
                      No invoices found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="inv-pagination">
            <span>
              Showing {totalCount ? (page - 1) * pageSize + 1 : 0} to{' '}
              {Math.min(page * pageSize, totalCount)} of {totalCount} invoices
            </span>
            <div>
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                ‹
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
                const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
                return startPage + index;
              })
                .filter((p) => p >= 1 && p <= totalPages)
                .map((number) => (
                  <button
                    key={number}
                    className={page === number ? 'inv-primary' : ''}
                    aria-current={page === number ? 'page' : undefined}
                    onClick={() => setPage(number)}
                    disabled={loading}
                  >
                    {number}
                  </button>
                ))}
              <button
                disabled={page >= totalPages || totalPages === 0 || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                ›
              </button>
              <select
                aria-label="Invoices per page"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bulk Selection Footer - only visible when items are selected */}
          {selected.length > 0 && (
            <div className="inv-bulk">
              <span>With selected ({selected.length}):</span>
              <button
                onClick={() => exportRows(invoices.filter((inv) => selected.includes(inv.id || inv.invoiceNumber)))}
              >
                <DownloadOutlined />
                Export
              </button>
              <button onClick={() => setSelected([])}>
                Clear selection
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Action Popover Menu - supports mouse hover & click */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleCloseMenu}
        autoFocus={false}
        disableAutoFocusItem
        disableEnforceFocus
        disableRestoreFocus
        MenuListProps={{
          onMouseEnter: handleCancelCloseMenu,
          onMouseLeave: handleScheduleCloseMenu,
          sx: { py: 0.5 },
        }}
        slotProps={{
          root: {
            sx: { pointerEvents: 'none' },
          },
          paper: {
            onMouseEnter: handleCancelCloseMenu,
            onMouseLeave: handleScheduleCloseMenu,
            elevation: 4,
            sx: {
              pointerEvents: 'auto',
              borderRadius: '10px',
              minWidth: 195,
              mt: 0.5,
              border: '1px solid #ebdccb',
              boxShadow: '0 10px 25px -5px rgba(50, 30, 20, 0.15), 0 8px 10px -6px rgba(50, 30, 20, 0.08)',
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem
          onClick={() => {
            const id = menuInvoice?.id || menuInvoice?.invoiceNumber;
            navigate(`/invoices/${encodeURIComponent(id)}`);
            handleCloseMenu();
          }}
        >
          <ListItemIcon>
            <VisibilityOutlined fontSize="small" sx={{ color: '#70472f' }} />
          </ListItemIcon>
          <ListItemText primary="View Details" />
        </MenuItem>

        <MenuItem
          onClick={() => {
            setPreviewInvoice(menuInvoice);
            handleCloseMenu();
          }}
        >
          <ListItemIcon>
            <PrintOutlined fontSize="small" sx={{ color: '#70472f' }} />
          </ListItemIcon>
          <ListItemText primary="Preview & Print" />
        </MenuItem>

        {(menuInvoice?.status?.toLowerCase() === 'draft' ||
          menuInvoice?.status?.toLowerCase() === 'issued' ||
          menuInvoice?.status?.toLowerCase() === 'sent') && (
          <MenuItem
            onClick={() => {
              const id = menuInvoice?.id || menuInvoice?.invoiceNumber;
              navigate(`/invoices/${encodeURIComponent(id)}/edit`);
              handleCloseMenu();
            }}
          >
            <ListItemIcon>
              <EditOutlined fontSize="small" sx={{ color: '#70472f' }} />
            </ListItemIcon>
            <ListItemText primary="Edit Invoice" />
          </MenuItem>
        )}

        {Number(
          menuInvoice?.balanceAmount ??
            (Number(menuInvoice?.totalAmount ?? menuInvoice?.total ?? 0) -
              Number(menuInvoice?.paidAmount ?? 0))
        ) > 0 &&
          menuInvoice?.status?.toLowerCase() !== 'cancelled' && (
            <MenuItem
              onClick={() => {
                setPaymentInvoice(menuInvoice);
                handleCloseMenu();
              }}
            >
              <ListItemIcon>
                <PaymentsOutlined fontSize="small" sx={{ color: '#00814d' }} />
              </ListItemIcon>
              <ListItemText primary="Record Payment" />
            </MenuItem>
          )}

        <MenuItem
          onClick={() => {
            const id = menuInvoice?.id || menuInvoice?.invoiceNumber;
            navigate(`/invoices/${encodeURIComponent(id)}/pdf`);
            handleCloseMenu();
          }}
        >
          <ListItemIcon>
            <PictureAsPdfOutlined fontSize="small" sx={{ color: '#c93b2b' }} />
          </ListItemIcon>
          <ListItemText primary="Invoice PDF" />
        </MenuItem>
      </Menu>

      {/* Modals */}
      <InvoicePreviewModal
        open={Boolean(previewInvoice)}
        onClose={() => setPreviewInvoice(null)}
        invoice={previewInvoice}
      />

      <RecordPaymentModal
        open={Boolean(paymentInvoice)}
        onClose={() => setPaymentInvoice(null)}
        invoice={paymentInvoice}
        onSuccess={() => {
          fetchInvoices();
        }}
      />
    </div>
  );
};

export default Invoices;
