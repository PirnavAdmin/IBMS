import { productApi } from '../../../../../billing-api-client/productApi.js';

export function normalizeProduct(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.id == null) throw new Error('Invalid product response.');
  const category = raw.category;
  const name = [raw.categoryName, typeof category === 'string' ? category : category?.name].find(value => typeof value === 'string' && value.trim());

  const unitPrice = Number(raw.price ?? raw.unitPrice ?? 0);
  const discountAllowed = Boolean(raw.discountAllowed);
  const discountPercent = Number(raw.discountPercent ?? raw.DiscountPercent ?? raw.discountPercentage ?? 0);
  const discountAmount = (discountAllowed && discountPercent > 0) ? Math.round(unitPrice * (discountPercent / 100) * 100) / 100 : 0;
  const netUnitPrice = unitPrice - discountAmount;

  let taxRate = Number(raw.taxRate ?? 0);
  if (!taxRate && raw.taxCategory) {
    const match = String(raw.taxCategory).match(/(\d+(?:\.\d+)?)/);
    if (match) taxRate = parseFloat(match[1]);
  }
  const taxAmount = taxRate > 0 ? Math.round(netUnitPrice * (taxRate / 100) * 100) / 100 : 0;
  const calculatedFinalPrice = Math.round((netUnitPrice + taxAmount) * 100) / 100;
  const rawFinalPrice = raw.defaultFinalPrice ?? raw.DefaultFinalPrice ?? raw.finalUnitPrice ?? raw.FinalUnitPrice;
  const defaultFinalPrice = (rawFinalPrice != null && Math.abs(Number(rawFinalPrice) - netUnitPrice) < 0.01 && taxAmount > 0)
    ? calculatedFinalPrice
    : (rawFinalPrice != null ? Number(rawFinalPrice) : calculatedFinalPrice);

  return {
    ...raw,
    categoryId: raw.categoryId ?? (typeof category === 'object' ? category?.id : null),
    category: typeof name === 'string' ? name : '',
    type: raw.type || 'Product',
    status: typeof raw.isActive === 'boolean' ? (raw.isActive ? 'Active' : 'Inactive') : raw.status || 'Unknown',
    hsnSac: raw.hsnSacCode ?? raw.hsnSac ?? '',
    discountPercentage: raw.discountPercent ?? raw.DiscountPercent ?? raw.discountPercentage ?? '',
    defaultFinalPrice,
    finalUnitPrice: defaultFinalPrice,
  };
}

export function normalizeProductPage(response, params = {}) {
  const items = response?.items ?? response?.products;
  if (!Array.isArray(items) || !Number.isFinite(Number(response?.totalCount))) throw new Error('Invalid product list response.');
  const pageSize = Number(response.pageSize ?? params.pageSize ?? 10);
  const pageNumber = Number(response.pageNumber ?? params.pageNumber ?? 1);
  if (pageSize < 1 || pageNumber < 1 || !Number.isFinite(pageSize) || !Number.isFinite(pageNumber)) throw new Error('Invalid product pagination response.');
  return { ...response, items: items.map(normalizeProduct), totalCount: Number(response.totalCount), pageSize, pageNumber, totalPages: Math.ceil(Number(response.totalCount) / pageSize) };
}

const productPayload = data => {
  const categoryId = Number(data.categoryId);
  if (!Number.isInteger(categoryId) || categoryId <= 0) throw new Error('Select a valid category.');
  // Product PUT documents rowVersion; preserve it from GET while sending only writable fields.
  const payload = Object.fromEntries(['productCode', 'name', 'description', 'type', 'unit', 'price', 'currency', 'taxCategory', 'category', 'discountAllowed', 'status', 'rowVersion']
    .filter(key => data[key] !== undefined).map(key => [key, data[key]]));
  return { ...payload, categoryId, discountPercent: data.discountPercentage ?? data.discountPercent, hsnSacCode: (data.hsnSac ?? data.hsnSacCode ?? '').trim() };
};

export const productApiService = {
  async getProducts(params = {}) {
    const { category, ...rest } = params;
    const request = { ...rest, ...(category ? { categoryId: Number(category) } : {}) };
    return normalizeProductPage(await productApi.getProducts(request), params);
  },
  async getCatalogMetadata() {
    // Use real server totals rather than counting one page or showing mock statistics.
    const [total, active, inactive, services] = await Promise.all([
      {}, { status: 'Active' }, { status: 'Inactive' }, { type: 'Service' },
    ].map(params => this.getProducts({ ...params, pageSize: 1, pageNumber: 1 })));
    return { summary: { total: total.totalCount, active: active.totalCount, inactive: inactive.totalCount, services: services.totalCount } };
  },
  async getProductById(id) { return normalizeProduct(await productApi.getProductById(id)); },
  createProduct: data => productApi.createProduct(productPayload(data)),
  updateProduct: (id, data) => productApi.updateProduct(id, productPayload(data)),
  getNextProductCode: () => productApi.getNextProductCode(),
};

export const productService = productApiService;
export default productService;
