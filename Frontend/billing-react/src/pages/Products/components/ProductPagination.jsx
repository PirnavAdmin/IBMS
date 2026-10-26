import { WorkspacePagination } from '../../../components/WorkspacePagination';

export function ProductPagination({ data, onPage, onPageSize, disabled = false }) {
  return <WorkspacePagination
    page={data.pageNumber}
    pageSize={data.pageSize}
    totalCount={data.totalCount}
    itemLabel="products"
    disabled={disabled}
    onPageChange={onPage}
    onPageSizeChange={onPageSize}
  />;
}
