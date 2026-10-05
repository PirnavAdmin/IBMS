import { useProductSelectProps } from './ProductSelect';
import { Button, IconButton, InputAdornment, MenuItem, TextField } from '@mui/material';
import { Close, Search } from '@mui/icons-material';

export function ProductFilters({ search, onSearch, params, onChange, categories, categoriesLoading, active, onClear }) {
  const categorySelectProps = useProductSelectProps();
  const statusSelectProps = useProductSelectProps();
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
    <Button disabled={!active} onClick={onClear}>Clear Filters</Button>
  </div>;
}
