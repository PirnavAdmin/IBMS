export const defaultDashboardFilters = () => {
  const today = new Date();
  const local = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { start: local(new Date(today.getFullYear(), today.getMonth(), 1)), end: local(today) };
};
export const money = (value, currency) => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
export async function collectPages(load, signal, limit = 2000) {
  const first = await load(1, signal);
  if (first.totalCount > limit) throw new Error(`This range contains more than ${limit.toLocaleString()} records. Narrow the dates to load accurate analytics.`);
  const rows = [...first.items];
  const pages = Math.ceil(first.totalCount / first.pageSize);
  for (let page = 2; page <= pages; page++) {
    if (signal?.aborted) throw new Error('Request cancelled.');
    const next = await load(page, signal);
    if (next.totalCount !== first.totalCount) throw new Error('Billing records changed while loading. Refresh to calculate accurate totals.');
    rows.push(...next.items);
  }
  if (rows.length !== first.totalCount || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Incomplete billing response. Refresh and try again.');
  return rows;
}
export function billingInsights(invoices, payments, currency, now = new Date()) {
  validateBillingRecords(invoices, 'invoices');
  validateBillingRecords(payments, 'payments');
  const selected = invoices.filter(row => row.currency === currency);
  const issued = selected.filter(row => !['Draft', 'Cancelled', 'Voided'].includes(row.status));
  const paid = payments.filter(row => row.currency === currency && row.status === 'Completed');
  const outstanding = issued.filter(row => row.balanceAmount > 0);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const age = row => row.dueDate ? Math.max(0, Math.ceil((today - Date.parse(row.dueDate.slice(0, 10))) / 86400000)) : null;
  const overdue = outstanding.filter(row => age(row) > 0 || row.status === 'Overdue');
  const sum = (rows, key) => rows.reduce((total, row) => {
    if (!Number.isFinite(row[key])) throw new Error(`Missing ${key} in billing response.`);
    return total + row[key];
  }, 0);
  const drafts = selected.filter(row => row.status === 'Draft');
  const summary = [
    { id: 'invoiced', label: 'Total Invoiced', value: sum(issued, 'totalAmount'), meta: `${issued.length} issued invoices`, icon: 'invoice' },
    { id: 'paid', label: 'Total Paid', value: sum(paid, 'amount'), meta: `${paid.length} completed payments`, icon: 'paid' },
    { id: 'outstanding', label: 'Outstanding', value: sum(outstanding, 'balanceAmount'), meta: `${outstanding.length} unpaid invoices`, icon: 'wallet' },
    { id: 'overdue', label: 'Overdue', value: sum(overdue, 'balanceAmount'), meta: `${overdue.length} overdue invoices`, icon: 'warning' },
    { id: 'drafts', label: 'Draft Invoices', value: drafts.length, valueType: 'number', meta: 'Not included in invoiced totals', icon: 'draft' },
  ].map(row => ({ ...row, currency }));
  const months = new Map();
  const add = (row, dateKey, amountKey, series) => {
    const key = row[dateKey]?.slice(0, 7);
    if (!key) throw new Error('Missing billing date in response.');
    if (!months.has(key)) months.set(key, { label: key, invoiced: 0, collected: 0 });
    months.get(key)[series] += row[amountKey];
  };
  issued.forEach(row => add(row, 'invoiceDate', 'totalAmount', 'invoiced'));
  paid.forEach(row => add(row, 'paymentDate', 'amount', 'collected'));
  const buckets = ['Current', '1?30 Days', '31?60 Days', '61?90 Days', '90+ Days', 'No due date'].map((label, index) => ({ label, value: 0, color: ['#674832','#a67752','#bf9470','#d4b596','#e6cfb4','#b4aea5'][index] }));
  outstanding.forEach(row => { const days = age(row); buckets[days === null ? 5 : days === 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4].value += row.balanceAmount; });
  return { summary, revenue: [...months.values()].sort((a, b) => a.label.localeCompare(b.label)), aging: buckets, invoices: selected.slice(0, 6), payments: payments.filter(row => row.currency === currency).slice(0, 6) };
}

// Validate whole source before calculating; malformed records must never become zero totals.
export function validateBillingRecords(rows, source) {
  const dateKey = source === 'invoices' ? 'invoiceDate' : 'paymentDate';
  const amounts = source === 'invoices' ? ['totalAmount', 'balanceAmount'] : ['amount'];
  for (const row of rows) {
    if (!row.currency || !row.status || !Number.isInteger(row.id)) throw new Error(`Invalid ${source} record. Currency, status and identifier are required.`);
    for (const key of amounts) if (!Number.isFinite(row[key])) throw new Error(`Missing ${key} in billing response.`);
    if (!row[dateKey] || !Number.isFinite(Date.parse(row[dateKey]))) throw new Error(`Invalid ${dateKey} in billing response.`);
    if (row.dueDate && !Number.isFinite(Date.parse(row.dueDate))) throw new Error('Invalid due date in billing response.');
    try { money(0, row.currency); } catch { throw new Error('Invalid currency in billing response.'); }
  }
  return rows;
}
