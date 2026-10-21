export const StatusBadge = ({ value = 'Unknown' }) => <span className={`bd-badge bd-badge-${String(value).toLowerCase().replaceAll(' ', '-')}`}>{value}</span>;
