export const PRODUCT_PAGE_SIZES = [5, 10, 20, 50];
const STORAGE_KEY = 'ibms.products.pageSize';

export function getProductPageSize() {
  try {
    const size = Number(window.localStorage.getItem(STORAGE_KEY));
    return PRODUCT_PAGE_SIZES.includes(size) ? size : 10;
  } catch {
    return 10;
  }
}

export function saveProductPageSize(size) {
  if (!PRODUCT_PAGE_SIZES.includes(size)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(size));
  } catch {
    // Pagination still works when browser storage is unavailable.
  }
}
