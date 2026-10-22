import { useQuery } from '@tanstack/react-query';
import { categoryApi } from '../../../../../billing-api-client/categoryApi.js';
import { transportErrorMessage } from '../../../../../billing-api-client/transportError.js';

export function categoryError(error, fallback = 'Unable to load categories. Please try again.') {
  const transportMessage = transportErrorMessage(error);
  if (transportMessage) return transportMessage;
  const status = error?.response?.status ?? error?.status;
  if (status === 401) return 'Please sign in to access categories.';
  if (status === 403) return 'You do not have permission to manage categories.';
  if (status === 404) return 'Category not found. Return to the category list and refresh.';
  if ([400, 409, 422].includes(status)) {
    const data = error?.response?.data;
    const messages = [data?.errors && Object.values(data.errors).flat(), data?.message, data?.title].flat().filter(value =>
      typeof value === 'string' && value.trim() && value.length <= 240 &&
      !/[<>]|stack\s*trace|exception|\bat\s+\S+\(|\bselect\b.+\bfrom\b/i.test(value));
    if (messages.length) return [...new Set(messages)].join(' ');
  }
  if (status === 409) return 'The category conflicts with an existing name or has changed. Refresh and try again.';
  if (status === 400 || status === 422) return 'The category could not be saved. Check the name, status, and whether the name already exists.';
  return fallback;
}

export function normalizeCategory(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid category response.');
  const id = raw.id ?? raw.categoryId ?? raw.Id;
  const name = raw.name ?? raw.categoryName ?? raw.Name;
  if (id == null || typeof name !== 'string') throw new Error('Invalid category response.');
  const active = raw.isActive ?? raw.IsActive;
  const status = raw.status ?? raw.Status;
  const normalizedStatus = typeof active === 'boolean' ? (active ? 'Active' : 'Inactive')
    : typeof status === 'string' && ['active', 'inactive'].includes(status.toLowerCase())
      ? (status.toLowerCase() === 'active' ? 'Active' : 'Inactive') : 'Unknown';
  const count = raw.productCount ?? raw.ProductCount;
  return { ...raw, id, name, description: typeof (raw.description ?? raw.Description) === 'string' ? (raw.description ?? raw.Description) : '', status: normalizedStatus,
    productCount: count != null && Number.isFinite(Number(count)) ? Number(count) : undefined };
}

export function validateCategory(values, categories, id) {
  const name = values.name.trim();
  if (!name) return 'Category Name is required.';
  if (name.length < 2 || name.length > 128) return 'Category Name must be between 2 and 128 characters.';
  if (categories.some(category => String(category.id) !== String(id) && category.name.trim().toLowerCase() === name.toLowerCase())) return 'A category with this name already exists.';
  if (!['Active', 'Inactive'].includes(values.status)) return 'Select a valid category status.';
  return '';
}

export const categoryService = {
  async getAll({ signal } = {}) {
    const response = await categoryApi.getCategories({ paged: false, status: 'All' }, { signal });
    const items = Array.isArray(response) ? response : response?.items ?? response?.categories;
    if (!Array.isArray(items)) throw new Error('Invalid category list response.');
    // Never silently use only a partial result for dropdowns or duplicate checks.
    if (!Array.isArray(response) && Number(response.totalCount ?? items.length) > items.length) throw new Error('Incomplete category list response.');
    return items.map(normalizeCategory);
  },
  async getById(id, options) { return normalizeCategory(await categoryApi.getCategoryById(id, options)); },
  async save(values, id, categories = []) {
    const error = validateCategory(values, categories, id);
    if (error) throw new Error(error);
    // Explicit request fields follow Swagger; Category PUT has no rowVersion field.
    const payload = { name: values.name.trim(), description: values.description.trim(), status: values.status };
    return id == null ? categoryApi.createCategory(payload) : categoryApi.updateCategory(id, payload);
  },
  setStatus: (id, status) => categoryApi.setCategoryStatus(id, status === 'Active'),
};

export const useCategories = () => useQuery({ queryKey: ['categories', 'list'], queryFn: ({ signal }) => categoryService.getAll({ signal }), retry: false });
export const invalidateCategories = queryClient => Promise.all([
  queryClient.invalidateQueries({ queryKey: ['categories'] }),
  queryClient.invalidateQueries({ queryKey: ['products'] }),
]);
