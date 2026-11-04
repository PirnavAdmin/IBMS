import Button from '@mui/material/Button';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import { Link } from 'react-router-dom';
import { DashboardErrorState } from '../../../components/dashboard/DashboardStates';
import '../../../styles/Dashboard.css';

export function ProductErrorState({ onRetry, message }) {
  return <DashboardErrorState title="Unable to load products" message={message} onRetry={onRetry} />;
}

export function ProductEmptyState({ filtered, onClear }) {
  return <div className="product-state"><Inventory2Outlined /><h2>{filtered ? 'No matching products' : 'No products found'}</h2><p>{filtered ? 'Try changing your search or filters.' : 'Products and services you create will appear here.'}</p>
    {filtered ? <Button variant="outlined" onClick={onClear}>Clear Filters</Button> : <Button component={Link} to="/products/new" variant="contained">+ Add Product</Button>}
  </div>;
}
