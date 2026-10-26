export const agingLabels = ['Current', '1\u201330 Days', '31\u201360 Days', '61\u201390 Days', '90+ Days', 'No due date'];
export const agingDays = (row, now = new Date()) => row.dueDate
  ? Math.max(0, Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.parse(row.dueDate.slice(0, 10))) / 86400000)) : null;
export const agingIndex = (row, now) => {
  const days = agingDays(row, now);
  return days === null ? 5 : days === 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
};
export const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;
