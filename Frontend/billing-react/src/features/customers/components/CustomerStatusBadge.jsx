export const CustomerStatusBadge = ({ status = 'Active' }) => {
  const isActive = status === 'Active';
  return (
    <span
      className={`cust-status-badge ${isActive ? 'active' : 'inactive'}`}
      aria-label={`Status: ${status}`}
    >
      <i className="cust-status-dot" aria-hidden="true" />
      {status}
    </span>
  );
};
