import { useState } from 'react';
import { printCatalogReport } from '../utils/printCatalogReport';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Breadcrumbs, Button, CircularProgress } from '@mui/material';
import { ArrowBack, PictureAsPdfOutlined, EditOutlined, QrCode2Outlined, Inventory2Outlined, SellOutlined, CategoryOutlined, StraightenOutlined, AttachMoneyOutlined, PercentOutlined, NumbersOutlined, CheckCircleOutline, DescriptionOutlined } from '@mui/icons-material';
import { DashboardErrorState } from '../../../components/dashboard/DashboardStates';
import { productService } from '../services/productService';
import { useCategories } from '../services/categoryService';
import '../styles/product-form.css';
import '../../../styles/Dashboard.css';

export function ProductDetails() {
  const { id } = useParams();
  const [exportError, setExportError] = useState('');
  const query = useQuery({ queryKey: ['products', 'detail', id], queryFn: () => productService.getProductById(id), retry: false });
  const categories = useCategories();
  const product = query.data;
  const categoryName = categories.data?.find(category => String(category.id) === String(product?.categoryId))?.name || product?.category;
  const fields = product ? [
    ['Product Code', product.productCode, QrCode2Outlined], ['Product Name', product.name, Inventory2Outlined], ['Type', product.type, SellOutlined],
    ['Category', categoryName || (product.categoryId ? `Category ${product.categoryId}` : 'Not assigned'), CategoryOutlined],
    ['Unit', product.unit, StraightenOutlined], ['Unit Price', `${product.currency || 'INR'} ${Number(product.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, AttachMoneyOutlined],
    ['Tax Category', product.taxCategory, PercentOutlined], ['HSN / SAC Code', product.hsnSac, NumbersOutlined],
    ['Discount (%)', product.discountPercentage === '' ? 'Not set' : `${product.discountPercentage}%`, PercentOutlined],
    ['Discount Allowed', product.discountAllowed ? 'Yes' : 'No', CheckCircleOutline],
  ] : [];
  const exportPdf = () => {
    setExportError('');
    try {
      printCatalogReport({ title: `Product Details - ${product.productCode || product.name}`, columns: ['Field', 'Details'], rows: [...fields.map(([label, value]) => [label, value || '-']), ['Status', product.status || 'Unknown'], ['Description', product.description || 'No description provided.']] });
    } catch (error) { setExportError(error.message); }
  };
  return <main className="product-page">
    <Breadcrumbs aria-label="Breadcrumb"><Link to="/products">Products</Link><span>{product?.productCode || 'Product Details'}</span></Breadcrumbs>
    <header className="product-heading"><div><span className="product-eyebrow">YOUR BILLING CATALOG</span><h1>Product Details</h1><p>{product?.name || 'Product information, pricing and billing settings.'}</p></div><div className="product-row-actions"><Button variant="outlined" startIcon={<PictureAsPdfOutlined />} disabled={!product || query.isError || query.isPending} onClick={exportPdf}>Print / Export PDF</Button><Button component={Link} to="/products" variant="outlined" startIcon={<ArrowBack />}>Back to Products</Button>{product && <Button component={Link} to={`/products/${encodeURIComponent(id)}/edit`} variant="contained" startIcon={<EditOutlined />}>Edit Product</Button>}</div></header>
    {exportError && <Alert severity="error" onClose={() => setExportError('')}>{exportError}</Alert>}
    {query.isPending ? <section className="product-panel product-state" role="status"><CircularProgress size={32} /><p>Loading product details...</p></section>
      : query.isError ? <DashboardErrorState title={query.error?.status === 404 ? 'Product not found' : 'Unable to load product'} message={query.error?.message} onRetry={() => query.refetch()} />
      : <section className="product-details-card" aria-label="Product details">
        {categories.isError && !product.category && <Alert severity="warning" action={<Button onClick={() => categories.refetch()}>Retry</Button>}>Unable to load the category name.</Alert>}
        <dl className="product-details-grid">{fields.map(([label, value, Icon]) => <div className="product-details-field" key={label}><dt><Icon aria-hidden="true" /><span>{label}</span></dt><dd>{value || '-'}</dd></div>)}</dl>
        <div className="product-details-bottom"><div className="product-details-field"><dt><CheckCircleOutline aria-hidden="true" /><span>Status</span></dt><dd><span className={`product-badge ${(product.status || '').toLowerCase()}`}>{product.status || 'Unknown'}</span></dd></div><div className="product-details-field product-details-description"><dt><DescriptionOutlined aria-hidden="true" /><span>Description</span></dt><dd>{product.description || 'No description provided.'}</dd></div></div>
      </section>}
  </main>;
}
