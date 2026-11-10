import { Component } from 'react';
import './PageLoading.css';

export class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    const isChunk = /dynamically imported module|failed to fetch|loading chunk|loading css/i.test(String(this.state.error?.message || ''));
    const retry = () => {
      if (isChunk && typeof window !== 'undefined') window.location.reload();
      else this.setState({ error: null });
    };
    return (
      <div role="alert" style={{ maxWidth: 560, margin: '48px auto', padding: '24px 28px', background: '#fff', border: '1px solid #EADFD2', borderRadius: 16, boxShadow: '0 8px 24px rgba(90,37,8,0.08)', color: '#171717' }}>
        <h2 style={{ margin: '0 0 8px', color: '#5A2508', fontSize: '1.15rem' }}>{isChunk ? 'A screen update is ready' : 'Unable to display this screen'}</h2>
        <p style={{ margin: '0 0 16px', color: '#667085', fontSize: '0.92rem' }}>{isChunk ? 'Reload to load the latest view assets.' : (this.state.error?.message || 'An unexpected error occurred while rendering this section.')}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={retry} style={{ padding: '8px 16px', borderRadius: 10, border: 0, background: '#5A2508', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{isChunk ? 'Reload page' : 'Try again'}</button>
          {this.props.onNavigateHome && <button type="button" onClick={() => { this.setState({ error: null }); this.props.onNavigateHome(); }} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #EADFD2', background: '#fff', color: '#5A2508', fontWeight: 600, cursor: 'pointer' }}>Back to Dashboard</button>}
        </div>
      </div>
    );
  }
}

export function PageLoading() {
  return <div className="page-loading" role="status" aria-live="polite" aria-busy="true">
    <div className="page-loading-content">
      <span className="page-loading-spinner" aria-hidden="true" />
      <span>Loading...</span>
    </div>
  </div>;
}
