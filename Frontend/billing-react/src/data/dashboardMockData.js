export const dashboardMockData = {
  summary: {
    totalInvoiced: { id: 'invoiced', label: 'Total Invoiced', value: 1245800, meta: '12.5% this month', trend: 'up', icon: 'invoice', tone: 'sand' },
    totalPaid: { id: 'paid', label: 'Total Paid', value: 980500, meta: '8.2% this month', trend: 'up', icon: 'paid', tone: 'mint' },
    outstanding: { id: 'outstanding', label: 'Outstanding', value: 265300, meta: '21 invoices', icon: 'wallet', tone: 'cream' },
    overdue: { id: 'overdue', label: 'Overdue', value: 84500, meta: '8 invoices', icon: 'warning', tone: 'rose' },
    drafts: { id: 'drafts', label: 'Draft Invoices', value: 14, valueType: 'number', meta: '₹1,36,000', icon: 'draft', tone: 'lavender' },
    paymentsReceived: { id: 'payments', label: 'Payments Received', value: 342000, meta: '36 transactions', icon: 'card', tone: 'mint' },
  },
  revenue: [
    { label: 'Jan', invoiced: 90000, collected: 50000 }, { label: 'Feb', invoiced: 150000, collected: 100000 }, { label: 'Mar', invoiced: 165000, collected: 105000 },
    { label: 'Apr', invoiced: 220000, collected: 155000 }, { label: 'May', invoiced: 230000, collected: 160000 }, { label: 'Jun', invoiced: 300000, collected: 225000 },
    { label: 'Jul', invoiced: 275000, collected: 180000 }, { label: 'Aug', invoiced: 295000, collected: 215000 }, { label: 'Sep', invoiced: 320000, collected: 230000 },
  ],
  invoiceStatus: [42, 78, 53, 106, 89, 136, 116, 154].map((value, index) => ({ label: `M${index + 1}`, value })),
  outstandingAging: [
    { label: 'Current', value: 120000, color: '#6f2f0d' }, { label: '1–30 Days', value: 72000, color: '#dea071' }, { label: '31–60 Days', value: 38500, color: '#f4c18e' },
    { label: '61–90 Days', value: 22000, color: '#ff934c' }, { label: '90+ Days', value: 12800, color: '#ff5252' },
  ],
  recentInvoices: [
    { invoice: 'INV-1045', customer: 'TechNova Pvt Ltd', date: '03 Sep 2026', dueDate: '15 Sep 2026', amount: 45000, status: 'Sent' },
    { invoice: 'INV-1044', customer: 'ABC Solutions', date: '02 Sep 2026', dueDate: '10 Sep 2026', amount: 32500, status: 'Paid' },
    { invoice: 'INV-1043', customer: 'CloudSoft Technologies', date: '01 Sep 2026', dueDate: '05 Sep 2026', amount: 27800, status: 'Overdue' },
    { invoice: 'INV-1042', customer: 'Nexa Labs', date: '31 Aug 2026', dueDate: '14 Sep 2026', amount: 18500, status: 'Partially Paid' },
    { invoice: 'INV-1041', customer: 'DigitalEdge', date: '30 Aug 2026', dueDate: '12 Sep 2026', amount: 12000, status: 'Draft' },
  ],
  recentPayments: [
    { customer: 'ABC Solutions', invoice: 'INV-1044', method: 'UPI', amount: 32500, status: 'Completed' }, { customer: 'TechNova Pvt Ltd', invoice: 'INV-1038', method: 'Bank Transfer', amount: 58000, status: 'Completed' },
    { customer: 'CloudSoft Technologies', invoice: 'INV-1035', method: 'Credit Card', amount: 16500, status: 'Completed' }, { customer: 'Nexa Labs', invoice: 'INV-1031', method: 'Cheque', amount: 22000, status: 'Completed' },
    { customer: 'DigitalEdge', invoice: 'INV-1028', method: 'UPI', amount: 12800, status: 'Completed' },
  ],
  topCustomers: [
    { rank: 1, customer: 'TechNova Pvt Ltd', amount: 285000, initials: 'T' }, { rank: 2, customer: 'ABC Solutions', amount: 210500, initials: 'A' }, { rank: 3, customer: 'CloudSoft Technologies', amount: 178000, initials: 'C' },
    { rank: 4, customer: 'Nexa Labs', amount: 142500, initials: 'N' }, { rank: 5, customer: 'DigitalEdge', amount: 118000, initials: 'D' },
  ],
  overdueInvoices: [
    { invoice: 'INV-1028', customer: 'CloudSoft Technologies', dueDate: '28 Aug 2026', amount: 22500, daysOverdue: '8 days' }, { invoice: 'INV-1019', customer: 'Alpha Tech', dueDate: '21 Aug 2026', amount: 18000, daysOverdue: '15 days' },
    { invoice: 'INV-1008', customer: 'Nexa Labs', dueDate: '10 Aug 2026', amount: 31500, daysOverdue: '26 days' }, { invoice: 'INV-0995', customer: 'DigitalEdge', dueDate: '05 Aug 2026', amount: 12800, daysOverdue: '31 days' },
  ],
  recentActivity: [
    { id: 1, type: 'payment', text: 'Payment received for INV-1044', timestamp: '5 minutes ago' }, { id: 2, type: 'invoice', text: 'Invoice INV-1045 created', timestamp: '24 minutes ago' },
    { id: 3, type: 'sent', text: 'Invoice INV-1041 sent to customer', timestamp: '1 hour ago' }, { id: 4, type: 'overdue', text: 'Invoice INV-1028 became overdue', timestamp: '3 hours ago' },
  ],
  tableColumns: {
    invoices: [{ key: 'invoice', label: 'Invoice #' }, { key: 'customer', label: 'Customer' }, { key: 'date', label: 'Date' }, { key: 'dueDate', label: 'Due Date' }, { key: 'amount', label: 'Amount', type: 'currency' }, { key: 'status', label: 'Status', type: 'status' }],
    payments: [{ key: 'customer', label: 'Customer' }, { key: 'invoice', label: 'Invoice #' }, { key: 'method', label: 'Method' }, { key: 'amount', label: 'Amount', type: 'currency' }, { key: 'status', label: 'Status', type: 'status' }],
    overdue: [{ key: 'invoice', label: 'Invoice #' }, { key: 'customer', label: 'Customer' }, { key: 'dueDate', label: 'Due Date' }, { key: 'amount', label: 'Amount', type: 'currency' }, { key: 'daysOverdue', label: 'Days Overdue', type: 'danger' }],
  },
};
