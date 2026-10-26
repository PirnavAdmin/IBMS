import { printCatalogReport } from '../utils/printCatalogReport';
import { FeedbackSnackbar } from '../../../components/FeedbackSnackbar';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Breadcrumbs, Button, IconButton, InputAdornment, ListItemIcon, Menu, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField } from '@mui/material';
import { Add, ArrowBack, CategoryOutlined, EditOutlined, MoreVert, PrintOutlined, SearchOutlined, ToggleOff, ToggleOn } from '@mui/icons-material';
import { categoryService, useCategories, categoryError, invalidateCategories } from '../services/categoryService';
import { DeactivateCategoryDialog } from '../components/DeactivateCategoryDialog';
import '../styles/products.css';
import '../styles/categories.css';

export function CategoryList() {
  const query = useCategories();
  // The service loads the complete list; sort a copy to preserve the query cache.
  const statusRank = { Active: 0, Unknown: 1, Inactive: 2 };
  const allCategories = [...(query.data || [])].sort((a, b) => (statusRank[a.status] ?? 1) - (statusRank[b.status] ?? 1));
  const [search, setSearch] = useState('');
  const searchTerm = search.trim().toLocaleLowerCase();
  const categories = searchTerm
    ? allCategories.filter(category => [category.name, category.description, category.status].some(value => String(value || '').toLocaleLowerCase().includes(searchTerm)))
    : allCategories;
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [exportError, setExportError] = useState('');
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
  const [actionsMenu, setActionsMenu] = useState(null);
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(categories.length / rowsPerPage) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [categories.length, page, rowsPerPage]);
  const closeActionsMenu = () => setActionsMenu(null);
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

  const exportPdf = () => {
    setExportError('');
    try {
      printCatalogReport({ title: 'Product Categories', columns: ['Category Name', 'Description', 'Status', 'Products'], rows: categories.map(category => [category.name, category.description?.trim() || 'N/A', category.status, category.productCount ?? '-']) });
    } catch (error) { setExportError(error.message); }
  };

  return <main className="product-page category-list-page">
    <Breadcrumbs aria-label="Breadcrumb"><Link to="/products">Products &amp; Services</Link><span>Product Categories</span></Breadcrumbs>
    <header className="product-heading"><div><span className="product-eyebrow">YOUR BILLING CATALOG</span><h1>Product Categories</h1><p>Manage categories used to organize products and services.</p></div><div className="product-row-actions"><Button component={Link} to="/products" variant="outlined" startIcon={<ArrowBack />}>Back to Products</Button><Button variant="outlined" className="billing-pdf-button" startIcon={<PrintOutlined />} disabled={query.isPending || query.isError} onClick={exportPdf}>Print</Button><Button component={Link} to="/products/categories/new" variant="contained" startIcon={<Add />}>Add Category</Button></div></header>
    {exportError && <Alert severity="error" onClose={() => setExportError('')}>{exportError}</Alert>}
    {error && !confirm && <Alert severity="error">{error}</Alert>}
    <section className="product-panel" aria-label="Category list">
      <div className="product-panel-heading"><div className="product-panel-title"><span className="product-panel-icon"><CategoryOutlined /></span><div><h2>Categories</h2><p>Organize your billing catalog.</p></div></div><span className="product-result-count">{query.isPending ? 'Loading categories...' : query.isError ? 'Categories unavailable' : `${categories.length}${searchTerm ? ' matching' : ''} categories`}</span></div>
      <div className="category-search-row"><TextField className="category-search" size="small" label="Search categories" placeholder="Category name, description, or status" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment> }} inputProps={{ 'aria-label': 'Search categories by name, description, or status' }} /></div>
      <TableContainer className="ibms-table-frame product-table category-table" tabIndex={0} role="region" aria-label="Scrollable categories">
        <Table stickyHeader aria-label="Product categories"><TableHead><TableRow>{['Category Name', 'Description', 'Status', 'Products', 'Actions'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{query.isPending ? <TableRow><TableCell colSpan={5}><div className="product-state" role="status">Loading categories...</div></TableCell></TableRow>
            : query.isError ? <TableRow><TableCell colSpan={5}><Alert severity="error" action={<Button onClick={() => query.refetch()}>Retry</Button>}>{categoryError(query.error)}</Alert></TableCell></TableRow>
            : !categories.length ? <TableRow><TableCell colSpan={5}><div className="product-state"><h2>No categories yet</h2><p>Add a category to organize products and services.</p></div></TableCell></TableRow>
            : categories.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(category => <TableRow key={category.id} hover>
            <TableCell><strong>{category.name}</strong></TableCell><TableCell className="category-description">{category.description?.trim() || 'N/A'}</TableCell>
            <TableCell><span className={`product-badge ${category.status.toLowerCase()}`}>{category.status}</span></TableCell>
            <TableCell>{category.productCount ?? '-'}</TableCell><TableCell><div className="product-row-actions category-actions">
              <IconButton size="small" className="ibms-row-actions-trigger" aria-label={`Actions for ${category.name}`} aria-haspopup="menu" aria-expanded={actionsMenu?.category.id === category.id} onClick={event => setActionsMenu({ anchor: event.currentTarget, category })}><MoreVert fontSize="small" /></IconButton>
            </div></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </TableContainer>
      <TablePagination component="div" className="category-pagination" count={categories.length} page={page} onPageChange={(_, nextPage) => setPage(nextPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={event => { setRowsPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[5, 10, 25, 50]} labelRowsPerPage="Categories per page" />
    </section>
    <Menu anchorEl={actionsMenu?.anchor} open={Boolean(actionsMenu)} onClose={closeActionsMenu}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      PaperProps={{ className: 'ibms-row-actions-menu' }}>
      {actionsMenu && <>
        <MenuItem component={Link} to={`/products/categories/${actionsMenu.category.id}/edit`} onClick={closeActionsMenu}>
          <ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon>Edit
        </MenuItem>
        <MenuItem disabled={busy || actionsMenu.category.status === 'Unknown'} onClick={() => { setConfirm(actionsMenu.category); closeActionsMenu(); }}>
          <ListItemIcon>{actionsMenu.category.status === 'Active' ? <ToggleOff fontSize="small" /> : <ToggleOn fontSize="small" />}</ListItemIcon>
          {actionsMenu.category.status === 'Active' ? 'Deactivate' : 'Activate'}
        </MenuItem>
      </>}
    </Menu>
    <DeactivateCategoryDialog open={Boolean(confirm)} activating={confirm?.status === 'Inactive'} busy={busy} error={error} onClose={() => { setConfirm(null); setError(''); }} onConfirm={() => confirm && changeStatus(confirm, confirm.status === 'Active' ? 'Inactive' : 'Active')} />
    <FeedbackSnackbar message={notice} onClose={() => setNotice('')} />
  </main>;
}
