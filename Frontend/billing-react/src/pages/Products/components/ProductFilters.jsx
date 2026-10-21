import { useProductSelectProps } from './ProductSelect';
import { Button, IconButton, InputAdornment, MenuItem, TextField } from '@mui/material';
import { Close, Search } from '@mui/icons-material';

const SORT_OPTIONS = [
  { label: 'Recently Added', sortBy: 'createdAt', sortOrder: 'desc' },
  { label: 'Alphabetical (A – Z)', sortBy: 'name', sortOrder: 'asc' },
  { label: 'Alphabetical (Z – A)', sortBy: 'name', sortOrder: 'desc' },
  { label: 'Price: Low to High', sortBy: 'price', sortOrder: 'asc' },
  { label: 'Price: High to Low', sortBy: 'price', sortOrder: 'desc' },
  { label: 'First Added', sortBy: 'id', sortOrder: 'asc' },
  { label: 'Last Added', sortBy: 'id', sortOrder: 'desc' },
];

function getSortValue(sortBy, sortOrder) {
  const match = SORT_OPTIONS.find(o => o.sortBy === sortBy && o.sortOrder === sortOrder);
  return match ? `${match.sortBy}:${match.sortOrder}` : '';
}

export function ProductFilters({ search, onSearch, params, onChange, categories, categoriesLoading, active, onClear }) {
  const categorySelectProps = useProductSelectProps();
  const statusSelectProps = useProductSelectProps();
  const sortSelectProps = useProductSelectProps();

  const sortValue = getSortValue(params.sortBy, params.sortOrder);

  const handleSortChange = (value) => {
    if (!value) {
      onChange({ sortBy: '', sortOrder: '' });
      return;
    }
    const option = SORT_OPTIONS.find(o => `${o.sortBy}:${o.sortOrder}` === value);
    if (option) onChange({ sortBy: option.sortBy, sortOrder: option.sortOrder });
  };

  return <div className="product-filters">
    <TextField className="product-search" label="Search products" placeholder="Search by product code or product name..." size="small" value={search} onChange={event => onSearch(event.target.value)} InputProps={{
      startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
      endAdornment: search ? <InputAdornment position="end"><IconButton size="small" aria-label="Clear search" onClick={() => onSearch('')}><Close fontSize="small" /></IconButton></InputAdornment> : null,
    }} />
    <TextField disabled={categoriesLoading} select SelectProps={categorySelectProps} label="Category" size="small" value={params.category} onChange={event => onChange({ category: event.target.value })}>
      <MenuItem value="">All Categories</MenuItem>{categories.map(category => <MenuItem key={category.id} value={String(category.id)}>{category.name}</MenuItem>)}
    </TextField>
    <TextField select SelectProps={statusSelectProps} label="Status" size="small" value={params.status} onChange={event => onChange({ status: event.target.value })}>
      <MenuItem value="">All Status</MenuItem><MenuItem value="Active">Active</MenuItem><MenuItem value="Inactive">Inactive</MenuItem>
    </TextField>
    <TextField
      select
      SelectProps={sortSelectProps}
      label="Sort By"
      size="small"
      value={sortValue}
      onChange={event => handleSortChange(event.target.value)}
      className="product-sort-select"
    >
      <MenuItem value="">Sort By</MenuItem>
      {SORT_OPTIONS.map(o => (
        <MenuItem key={`${o.sortBy}:${o.sortOrder}`} value={`${o.sortBy}:${o.sortOrder}`}>{o.label}</MenuItem>
      ))}
    </TextField>
    <Button disabled={!active} onClick={onClear}>Clear Filters</Button>
  </div>;
}
