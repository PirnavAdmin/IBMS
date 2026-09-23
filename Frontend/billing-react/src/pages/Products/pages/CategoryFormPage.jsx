import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Breadcrumbs, Button } from '@mui/material';
import { categoryService, useCategories, categoryError, validateCategory, invalidateCategories } from '../services/categoryService';
import { DeactivateCategoryDialog } from '../components/DeactivateCategoryDialog';
import '../styles/products.css';
import '../styles/product-form.css';
import '../styles/categories.css';

function CategoryForm({ category, categories }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const requestLock = useRef(false);
  const [values, setValues] = useState(category || { name: '', description: '', status: 'Active' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const change = event => { setValues(previous => ({ ...previous, [event.target.name]: event.target.value })); setError(''); };
  const save = async () => {
    if (requestLock.current) return;
    const validation = validateCategory(values, categories, category?.id);
    if (validation) { setError(validation); setConfirm(false); return; }
    requestLock.current = true;
    setBusy(true);
    setError('');
    try {
      await categoryService.save(values, category?.id, categories);
      await invalidateCategories(queryClient);
      navigate('/products/categories', { replace: true, state: { categoryNotice: `Category "${values.name.trim()}" ${category ? 'updated' : 'created'} successfully.` } });
    } catch (err) { setConfirm(false); setError(categoryError(err, 'Unable to save category. Please try again.')); }
    finally { requestLock.current = false; setBusy(false); }
  };
  const submit = event => {
    event.preventDefault();
    if (busy) return;
    const validation = validateCategory(values, categories, category?.id);
    if (validation) { setError(validation); return; }
    if (category && category.status !== values.status) setConfirm(true);
    else save();
  };
  return <div className="product-form-container category-form">
    <form className="product-form-panel" onSubmit={submit} noValidate>
      <div className="product-form-section"><h2 className="product-section-title">Category Information</h2>
        <div className="product-form-grid">
          <div className="product-form-field"><label htmlFor="category-name" className="product-field-label">Category Name <span className="product-field-required">*</span></label><input disabled={busy} autoFocus id="category-name" name="name" className={`product-input ${error ? 'has-error' : ''}`} value={values.name} onChange={change} maxLength={128} required aria-invalid={Boolean(error)} aria-describedby={error ? 'category-error' : undefined} />{error && <span id="category-error" className="product-field-error" role="alert">{error}</span>}</div>
          <div className="product-form-field"><label htmlFor="category-status" className="product-field-label">Status</label><select disabled={busy} id="category-status" name="status" className="product-select" value={values.status} onChange={change}><option>Active</option><option>Inactive</option></select></div>
          <div className="product-form-field product-form-full"><label htmlFor="category-description" className="product-field-label">Description</label><textarea disabled={busy} id="category-description" name="description" className="product-textarea" rows={4} value={values.description} onChange={change} /></div>
        </div>
      </div>
      <div className="category-form-actions"><Button disabled={busy} component={Link} to="/products/categories" variant="outlined">Cancel</Button><Button disabled={busy} type="submit" variant="contained">{busy ? 'Saving...' : category ? 'Save Changes' : 'Save Category'}</Button></div>
    </form>
    <DeactivateCategoryDialog busy={busy} open={confirm} activating={values.status === 'Active'} onClose={() => setConfirm(false)} onConfirm={save} />
  </div>;
}

export function CategoryFormPage() {
  const { categoryId } = useParams();
  const categoriesQuery = useCategories();
  const detailQuery = useQuery({ queryKey: ['categories', 'detail', categoryId], queryFn: ({ signal }) => categoryService.getById(categoryId, { signal }), enabled: Boolean(categoryId), retry: false });
  const category = detailQuery.data;
  const loading = categoriesQuery.isPending || (categoryId && detailQuery.isPending);
  const error = categoriesQuery.error || detailQuery.error;
  const title = categoryId ? 'Edit Category' : 'Add Category';
  return <main className="product-page">
    <Breadcrumbs aria-label="Breadcrumb"><Link to="/products">Products &amp; Services</Link><Link to="/products/categories">Product Categories</Link><span>{title}</span></Breadcrumbs>
    <header className="product-heading"><div><span className="product-eyebrow">YOUR BILLING CATALOG</span><h1>{title}</h1><p>{categoryId ? 'Update category details and availability.' : 'Create a category to organize products and services.'}</p></div></header>
    {loading ? <div className="product-panel product-state" role="status">Loading category information...</div>
      : error ? <Alert severity="error" action={<Button onClick={() => { categoriesQuery.refetch(); if (categoryId) detailQuery.refetch(); }}>Retry</Button>}>{categoryError(error)}</Alert>
      : <CategoryForm key={categoryId || 'new'} category={category} categories={categoriesQuery.data || []} />}
  </main>;
}
