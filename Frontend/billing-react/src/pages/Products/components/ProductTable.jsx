import { Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Tooltip } from '@mui/material';
import { ProductActionsMenu } from './ProductActionsMenu';
import { ProductEmptyState, ProductErrorState } from './ProductStates';
import { Inventory2Outlined, DesignServicesOutlined } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { formatProductPrice } from '../utils/formatProductPrice';

const columns = [
  ['productCode', 'Product Code', true], ['name', 'Product Name', true], ['type', 'Type'],
  ['category', 'Category', true], ['unit', 'Unit'], ['price', 'Unit Price', true],
  ['discount', 'Discount'], ['tax', 'Tax'], ['finalPrice', 'Final Price'],
  ['taxCategory', 'Tax Category'], ['status', 'Status'], ['actions', 'Actions'],
];

function discountLabel(product) {
  if (product.discountAllowed === false) return 'Not Applicable';
  const percentage = product.discountPercent ?? product.discountPercentage;
  if (product.discountAllowed !== true || percentage == null || percentage === '' || !Number.isFinite(Number(percentage))) return 'Unavailable';
  return `${Number(percentage)}%`;
}

function unresolvedTaxLabel(product) {
  const category = product.taxCategory?.trim();
  return /^(exempt|not applicable)$/i.test(category || '') ? category : 'Unavailable';
}

export function ProductTable({ items, loading, error, params, onSort, filtered, onClear, onRetry }) {
  return <TableContainer className="product-table" tabIndex={0} aria-label="Scrollable product catalog" aria-busy={loading}>
    <Table aria-label="Products and services catalog" size="small">
      <TableHead><TableRow>{columns.map(([key, label, sortable]) => <TableCell key={key} align="left" sortDirection={params.sortBy === key ? params.sortOrder : false}>
        {sortable ? <TableSortLabel sx={key === 'price' ? { marginRight: 0, flexDirection: 'row', whiteSpace: 'nowrap', '& .MuiTableSortLabel-icon': { marginRight: 0, marginLeft: '4px' } } : undefined} active={params.sortBy === key} direction={params.sortBy === key ? params.sortOrder : 'asc'} onClick={() => onSort(key)}>{label}</TableSortLabel> : label}
      </TableCell>)}</TableRow></TableHead>
      <TableBody>{loading ? Array.from({ length: 7 }, (_, row) => <TableRow key={row}>{columns.map(([key]) => <TableCell key={key} align="left"><Skeleton height={28} /></TableCell>)}</TableRow>)
        : error ? <TableRow><TableCell colSpan={columns.length} align="left"><ProductErrorState message={error?.message} onRetry={onRetry} /></TableCell></TableRow>
        : !items.length ? <TableRow><TableCell colSpan={columns.length} align="left"><ProductEmptyState filtered={filtered} onClear={onClear} /></TableCell></TableRow>
        : items.map(product => <TableRow hover key={product.id}>
          <TableCell align="left"><span className="product-code">{product.productCode}</span></TableCell>
          <TableCell align="left"><div className="product-identity"><span className={`product-row-icon ${product.type.toLowerCase()}`} aria-hidden="true">{product.type === 'Service' ? <DesignServicesOutlined fontSize="small" /> : <Inventory2Outlined fontSize="small" />}</span><Tooltip title={product.name}><Link to={`/products/${encodeURIComponent(product.id)}`} className="product-name">{product.name}</Link></Tooltip></div></TableCell>
          <TableCell align="left"><span className={`product-badge ${product.type.toLowerCase()}`}>{product.type}</span></TableCell>
          <TableCell align="left"><Tooltip title={product.category}><span className="product-category">{product.category}</span></Tooltip></TableCell>
          <TableCell align="left">{product.unit || '-'}</TableCell><TableCell align="left" className="product-price">{formatProductPrice(product.price, product.currency)}</TableCell>
          <TableCell align="left"><Tooltip title="Saved product discount; transaction discounts may differ."><span>{discountLabel(product)}</span></Tooltip></TableCell>
          <TableCell align="left"><Tooltip title="Tax amount is unavailable for this product."><span>{unresolvedTaxLabel(product)}</span></Tooltip></TableCell>
          <TableCell align="left"><Tooltip title="Final unit price is unavailable for this product."><span>Unavailable</span></Tooltip></TableCell>
          <TableCell align="left">{product.taxCategory}</TableCell><TableCell align="left"><span className={`product-badge ${product.status.toLowerCase()}`}>{product.status}</span></TableCell>
          <TableCell align="left"><ProductActionsMenu product={product} /></TableCell>
        </TableRow>)}
      </TableBody>
    </Table>
  </TableContainer>;
}
