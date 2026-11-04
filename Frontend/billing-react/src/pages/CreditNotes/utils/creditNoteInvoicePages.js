export const fetchAllInvoicePages = async (fetchPage, pageSize = 100) => {
  const allItems = [];
  let pageNumber = 1;
  let totalPages = 1;
  do {
    const page = await fetchPage(pageNumber, pageSize);
    if (!Array.isArray(page?.items)) throw new Error('The invoice API returned an invalid page.');
    allItems.push(...page.items);
    const reportedPages = Number(page.totalPages);
    const totalCount = Number(page.totalCount);
    totalPages = Number.isFinite(reportedPages) && reportedPages > 0
      ? reportedPages
      : Number.isFinite(totalCount) && totalCount > 0
        ? Math.ceil(totalCount / pageSize)
        : (page.items.length === pageSize ? pageNumber + 1 : pageNumber);
    pageNumber += 1;
  } while (pageNumber <= totalPages);
  return allItems;
};
