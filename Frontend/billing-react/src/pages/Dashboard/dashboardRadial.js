// Revenue metrics use different date cohorts. There is no common progress denominator.
export const revenueAmounts = summary => ({
  invoiced: summary.find(row => row.id === 'invoiced')?.value ?? null,
  collected: summary.find(row => row.id === 'paid')?.value ?? null,
});

export const agingRadial = data => {
  const total = data.reduce((sum, row) => sum + row.value, 0);
  let offset = 0;
  const colors = ['#de9a58', '#b77b48', '#91613f', '#715143', '#594941', '#8c8177'];
  const buckets = data.map((row, index) => {
    const share = total > 0 ? row.value / total * 100 : 0;
    const bucket = { ...row, label: row.label.replaceAll('?', '\u2013'), color: colors[index] || row.color, share, offset };
    offset += share;
    return bucket;
  });
  return { total, buckets, currentShare: buckets.find(row => row.label === 'Current')?.share ?? 0 };
};

// Match collections to the same issued invoices, using their authoritative paid balances.
// Date-filtered payment totals can include other invoices and are not this denominator.
export const revenueCohort = (invoices, currency) => {
  const issued = invoices.filter(row => row.currency === currency && !['Draft', 'Cancelled', 'Voided'].includes(row.status));
  if (!issued.length || issued.some(row => !Number.isFinite(row.totalAmount) || !Number.isFinite(row.paidAmount))) return null;
  const invoiced = issued.reduce((sum, row) => sum + row.totalAmount, 0);
  const collected = issued.reduce((sum, row) => sum + row.paidAmount, 0);
  if (invoiced <= 0 || collected < 0) return null;
  return { invoiced, collected, invoicedPercent: invoiced / invoiced * 100, collectedPercent: collected / invoiced * 100 };
};
