import './PageLoading.css';

export function PageLoading() {
  return <div className="page-loading" role="status" aria-live="polite" aria-busy="true">
    <div className="page-loading-content">
      <span className="page-loading-spinner" aria-hidden="true" />
      <span>Loading...</span>
    </div>
  </div>;
}
