const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const dashboardPeriods = (now = new Date()) => {
  const end = localDate(now);
  const daysAgo = days => {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return localDate(date);
  };
  return [
    { id: 'month', label: 'This month', start: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), end },
    { id: '30days', label: 'Last 30 days', start: daysAgo(29), end },
    { id: '90days', label: 'Last 90 days', start: daysAgo(89), end },
    { id: 'quarter', label: 'This quarter', start: localDate(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), end },
  ];
};
