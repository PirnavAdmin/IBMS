import { buildProductListReport } from './utils/productListReport';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Breadcrumbs, Button } from '@mui/material';
import { Add, Inventory2Outlined, PictureAsPdfOutlined } from '@mui/icons-material';
import { productService } from './services/productService';
import { ProductFilters } from './components/ProductFilters';
import { ProductTable } from './components/ProductTable';
import { ProductPagination } from './components/ProductPagination';
import { ProductSummaryCards } from './components/ProductSummaryCards';
import './styles/products.css';
import './styles/product-list.css';
import { useCategories } from './services/categoryService';

import { useSearchCommit } from '../../hooks/useSearchDebounce';
import { searchParams } from '../../utils/search';
import { getProductPageSize, saveProductPageSize } from './utils/productPageSize';

const initialParams = { search: '', category: '', status: '', type: '', pageNumber: 1, pageSize: 10, sortBy: '', sortOrder: '' };

export function ProductList() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState(location.state?.productNotice || '');

  useEffect(() => {
    if (location.state?.productNotice) {
      setNotice(location.state.productNotice);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data || [];
  const [search, setSearch] = useState('');
  const [params, setParams] = useState(() => ({ ...initialParams, pageSize: getProductPageSize() }));
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  useSearchCommit(search, value => setParams(previous => searchParams(previous, value)));
  const catalog = useQuery({ queryKey: ['products', 'metadata'], queryFn: ({ signal }) => productService.getCatalogMetadata({ signal }), staleTime: 60000 });
  const query = useQuery({ queryKey: ['products', 'list', params], queryFn: ({ signal }) => productService.getProducts(params, { signal }), placeholderData: keepPreviousData });
  const change = patch => setParams(previous => ({ ...previous, ...patch, pageNumber: 1 }));
  const clear = () => { setSearch(''); setParams(previous => ({ ...initialParams, pageSize: previous.pageSize })); };
  const selectedCard = params.type === 'Service' ? 'services' : params.status === 'Active' && !params.type ? 'active' : params.status === 'Inactive' && !params.type ? 'inactive' : !params.status && !params.type ? 'total' : '';
  const selectCard = key => setParams(previous => ({ ...previous, status: key === 'active' ? 'Active' : key === 'inactive' ? 'Inactive' : '', type: key === 'services' ? 'Service' : '', pageNumber: 1 }));
  const active = Boolean(search || params.search || params.category || params.status || params.type || params.sortBy || params.sortOrder);
  const loading = query.isPending || catalog.isPending;
  const updating = search.trim() !== params.search || query.isFetching;
  const error = query.error || catalog.error || categoriesQuery.error;

  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true); setExportError('');
    try {
      const first = await productService.getProducts({ ...params, pageNumber: 1, pageSize: 100 });
      const all = [...first.items];
      for (let pageNumber = 2; pageNumber <= Math.ceil(first.totalCount / 100); pageNumber += 1) {
        const page = await productService.getProducts({ ...params, pageNumber, pageSize: 100 });
        all.push(...page.items);
      }
      if (all.length !== first.totalCount) throw new Error('The complete filtered result set could not be retrieved.');
      const report = buildProductListReport(all, categories);
      const blob = new Blob([report], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) throw new Error('Allow pop-ups to open the printable report and save it as PDF.');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { setExportError(err?.message || 'Unable to generate the filtered report.'); }
    finally { setExporting(false); }
  };

  return <main className="product-page product-list-page">
    <Breadcrumbs aria-label="Breadcrumb"><span>Products &amp; Services</span><span>Product List</span></Breadcrumbs>
    <header className="product-heading"><div><span className="product-eyebrow">YOUR BILLING CATALOG</span><h1>Products &amp; Services</h1><p>Manage products and services used for billing and invoicing.</p></div><div className="product-row-actions"><Button component={Link} to="/products/categories" variant="outlined">Categories</Button><Button variant="outlined" startIcon={<PictureAsPdfOutlined />} disabled={exporting || loading || Boolean(error)} onClick={exportPdf}>{exporting ? 'Generating PDF...' : 'Print / Export PDF'}</Button><Button component={Link} to="/products/new" variant="contained" startIcon={<Add />}>Add Product</Button></div></header>
    <FeedbackSnackbar message={notice} onClose={() => setNotice('')} />
    <ProductSummaryCards summary={catalog.data?.summary} selected={selectedCard} onSelect={selectCard} />
    {exportError && <FeedbackSnackbar message={exportError} onClose={() => setExportError('')} severity="error" />}
    <section className="product-panel" aria-label="Product list">
      <div className="product-panel-heading"><div className="product-panel-title"><span className="product-panel-icon"><Inventory2Outlined fontSize="small" /></span><div><h2>Product catalog</h2><p>Everything you bill, organized in one place.</p></div></div><span className="product-result-count" role="status">{loading ? 'Loading catalog…' : error ? 'Catalog unavailable' : updating ? 'Updating results?' : `${query.data?.totalCount ?? 0} ${active ? 'matching ' : ''}items`}</span></div>
      <ProductFilters search={search} onSearch={setSearch} params={params} onChange={change} categories={categories} categoriesLoading={categoriesQuery.isPending || categoriesQuery.isError} active={active} onClear={clear} />
      <ProductTable items={(query.data?.items || []).map(product => ({ ...product, category: categories.find(category => String(category.id) === String(product.categoryId))?.name || product.category || '-' }))} loading={loading} error={error} params={params} onSort={sortBy => change({ sortBy, sortOrder: params.sortBy === sortBy && params.sortOrder === 'asc' ? 'desc' : 'asc' })} filtered={Boolean(params.search || params.category || params.status)} onClear={clear} onRetry={() => { query.refetch(); catalog.refetch(); categoriesQuery.refetch(); }} />
      {!loading && !error && query.data && <ProductPagination data={query.data} disabled={updating} onPage={pageNumber => setParams(previous => ({ ...previous, pageNumber }))} onPageSize={pageSize => { saveProductPageSize(pageSize); change({ pageSize }); }} />}
    </section>
  </main>;
}
