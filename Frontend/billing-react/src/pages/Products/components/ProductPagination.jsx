import { useProductSelectProps } from './ProductSelect';
import { MenuItem, Pagination, PaginationItem, TextField } from '@mui/material';
import { PRODUCT_PAGE_SIZES } from '../utils/productPageSize';

export function ProductPagination({ data, onPage, onPageSize, disabled = false }) {
  const { pageNumber, pageSize, totalCount, totalPages } = data;
  const first = totalCount ? (pageNumber - 1) * pageSize + 1 : 0;
  const last = Math.min(pageNumber * pageSize, totalCount);
  const selectProps = useProductSelectProps();
  return <footer className="product-pagination">
    <span role="status">Showing {first}–{last} of {totalCount} products</span>
    <TextField disabled={disabled} select SelectProps={selectProps} size="small" label="Rows per page" value={pageSize} onChange={event => onPageSize(Number(event.target.value))}>{PRODUCT_PAGE_SIZES.map(size => <MenuItem key={size} value={size}>{size}</MenuItem>)}</TextField>
    <Pagination disabled={disabled} aria-label="Product pages" count={Math.max(1, totalPages)} page={pageNumber} onChange={(_, page) => onPage(page)} shape="rounded" color="primary" renderItem={item => <PaginationItem {...item} slots={{ previous: () => <span>Previous</span>, next: () => <span>Next</span> }} />} />
  </footer>;
}
