import { useId } from 'react';
import { MenuItem, Pagination, PaginationItem, TextField } from '@mui/material';
import './WorkspacePagination.css';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

/** Shared pagination footer used throughout the workspace. Page numbers are 1-based. */
export function WorkspacePagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'records',
  disabled = false,
  className = '',
}) {
  const pageSizeLabelId = useId();
  const safeTotal = Math.max(0, Number(totalCount) || 0);
  const safeSize = Math.max(1, Number(pageSize) || 1);
  const pageCount = Math.max(1, Math.ceil(safeTotal / safeSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const first = safeTotal ? (currentPage - 1) * safeSize + 1 : 0;
  const last = safeTotal ? Math.min(currentPage * safeSize, safeTotal) : 0;

  return (
    <footer className={`workspace-pagination ${className}`.trim()}>
      <span className="workspace-pagination-range" role="status">
        Showing {first}–{last} of {safeTotal} {itemLabel}
      </span>
      <div className="workspace-pagination-controls">
        <div className="workspace-pagination-size-field">
          <span id={pageSizeLabelId}>Rows per page</span>
          <TextField
            select
            size="small"
            value={safeSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="workspace-pagination-size"
            SelectProps={{
              labelId: pageSizeLabelId,
              MenuProps: {
                anchorOrigin: { vertical: 'top', horizontal: 'left' },
                transformOrigin: { vertical: 'bottom', horizontal: 'left' },
                PaperProps: { className: 'workspace-pagination-menu' },
              },
            }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <MenuItem key={size} value={size}>{size}</MenuItem>
            ))}
          </TextField>
        </div>
        <Pagination
          count={pageCount}
          page={currentPage}
          disabled={disabled}
          onChange={(_, value) => onPageChange(value)}
          shape="rounded"
          siblingCount={0}
          boundaryCount={0}
          aria-label={`${itemLabel} pages`}
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
      </div>
    </footer>
  );
}
