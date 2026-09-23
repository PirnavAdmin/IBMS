import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Breadcrumbs, Button, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { Add, CategoryOutlined } from '@mui/icons-material';
import { categoryService, useCategories, categoryError, invalidateCategories } from '../services/categoryService';
import { DeactivateCategoryDialog } from '../components/DeactivateCategoryDialog';
import '../styles/products.css';
import '../styles/categories.css';

export function CategoryList() {
  const query = useCategories();
  const categories = query.data || [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const requestLock = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState(location.state?.categoryNotice || '');
  useEffect(() => {
    if (location.state?.categoryNotice) {
      setNotice(location.state.categoryNotice);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);
  const [confirm, setConfirm] = useState(null);
  const changeStatus = async (category, status) => {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(true);
    setError('');
    try {
      await categoryService.setStatus(category.id, status);
      setConfirm(null);
      setNotice(`Category "${category.name}" ${status === 'Active' ? 'activated' : 'deactivated'} successfully.`);
      await invalidateCategories(queryClient);
    } catch (err) { setError(categoryError(err, 'Unable to change category status. Please try again.')); }
    finally { requestLock.current = false; setBusy(false); }
  };

  return <main className="product-page">
    <Breadcrumbs aria-label="Breadcrumb"><Link to="/products">Products &amp; Services</Link><span>Product Categories</span></Breadcrumbs>
    <header className="product-heading"><div><span className="product-eyebrow">YOUR BILLING CATALOG</span><h1>Product Categories</h1><p>Manage categories used to organize products and services.</p></div><Button component={Link} to="/products/categories/new" variant="contained" startIcon={<Add />}>Add Category</Button></header>
    {error && !confirm && <Alert severity="error">{error}</Alert>}
    <section className="product-panel" aria-label="Category list">
      <div className="product-panel-heading"><div className="product-panel-title"><span className="product-panel-icon"><CategoryOutlined /></span><div><h2>Categories</h2><p>Organize your billing catalog.</p></div></div><span className="product-result-count">{query.isPending ? 'Loading categories...' : query.isError ? 'Categories unavailable' : `${categories.length} categories`}</span></div>
      <TableContainer className="product-table category-table" tabIndex={0} aria-label="Scrollable categories">
        <Table aria-label="Product categories"><TableHead><TableRow>{['Category Name', 'Description', 'Status', 'Products', 'Actions'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{query.isPending ? <TableRow><TableCell colSpan={5}><div className="product-state" role="status">Loading categories...</div></TableCell></TableRow>
            : query.isError ? <TableRow><TableCell colSpan={5}><Alert severity="error" action={<Button onClick={() => query.refetch()}>Retry</Button>}>{categoryError(query.error)}</Alert></TableCell></TableRow>
            : !categories.length ? <TableRow><TableCell colSpan={5}><div className="product-state"><h2>No categories yet</h2><p>Add a category to organize products and services.</p></div></TableCell></TableRow>
            : categories.map(category => <TableRow key={category.id} hover>
            <TableCell><strong>{category.name}</strong></TableCell><TableCell className="category-description">{category.description || '—'}</TableCell>
            <TableCell><span className={`product-badge ${category.status.toLowerCase()}`}>{category.status}</span></TableCell>
            <TableCell>{category.productCount ?? '-'}</TableCell><TableCell><div className="product-row-actions"><Button component={Link} to={`/products/categories/${category.id}/edit`} size="small" aria-label={`Edit ${category.name}`}>Edit</Button><Button disabled={busy || category.status === 'Unknown'} size="small" aria-label={`${category.status === 'Active' ? 'Deactivate' : 'Activate'} ${category.name}`} onClick={() => setConfirm(category)}>{category.status === 'Active' ? 'Deactivate' : 'Activate'}</Button></div></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </TableContainer>
    </section>
    <DeactivateCategoryDialog open={Boolean(confirm)} activating={confirm?.status === 'Inactive'} busy={busy} error={error} onClose={() => { setConfirm(null); setError(''); }} onConfirm={() => confirm && changeStatus(confirm, confirm.status === 'Active' ? 'Inactive' : 'Active')} />
    <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice('')}><Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert></Snackbar>
  </main>;
}
