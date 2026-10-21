import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowBack, DownloadOutlined, PictureAsPdfOutlined } from '@mui/icons-material';
import { Breadcrumbs, Button, MenuItem, TextField } from '@mui/material';
import html2pdf from 'html2pdf.js';
import { creditNoteService } from '../services/creditNoteService';
import { CreditNoteStatusBadge } from '../components/CreditNoteStatusBadge';
import { DashboardErrorState } from '../../../components/dashboard/DashboardStates';
import { FeedbackSnackbar } from '../../../components/FeedbackSnackbar';
import { formatDate, formatDateTime, money } from '../utils/creditNoteCalculations';
import '../styles/credit-notes.css';

const safeName = (value) => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().replace(/\s+/g, '-') || 'credit-note';

export function CreditNoteExportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['creditNotes', id], queryFn: () => creditNoteService.get(id) });
  const [filename, setFilename] = useState('');
  const [orientation, setOrientation] = useState('portrait');
  const [includeApprovals, setIncludeApprovals] = useState(true);
  const [includeRefunds, setIncludeRefunds] = useState(true);
  const [includeTimeline, setIncludeTimeline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const note = query.data;
  const outputName = `${safeName((filename || note?.number || 'credit-note').replace(/\.pdf$/i, ''))}.pdf`;

  const download = async () => {
    if (busy) return;
    const element = document.getElementById('cn-export-document');
    if (!element) return setError('PDF preview is not ready.');
    setBusy(true); setError('');
    try {
      await html2pdf().set({
        margin: 10,
        filename: outputName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation },
        pagebreak: { mode: ['css', 'legacy'] },
      }).from(element).save();
      setNotice('Credit note PDF downloaded.');
    } catch (err) {
      setError(err?.message || 'PDF could not be generated.');
    } finally { setBusy(false); }
  };

  if (query.isPending) return <main className="cn-page"><div className="cn-loading-card">Loading credit note…</div></main>;
  if (query.isError) return <main className="cn-page"><DashboardErrorState title="Unable to load credit note" message={query.error.message} onRetry={() => query.refetch()} /><Button component={Link} to="/credit-notes">Back to Credit Notes</Button></main>;

  const approvalEvents = [
    ['Submitted', note.createdBy, note.createdAt], ['Approved', note.approvedBy, note.approvedAt],
    ['Rejected', note.rejectedBy, note.rejectedAt], ['Issued', note.issuedBy, note.issuedAt],
  ].filter(([, , date]) => date);

  return <main className="cn-page cn-export-page">
    <Breadcrumbs className="cn-breadcrumbs"><Link to="/credit-notes">Credit Notes</Link><Link to={`/credit-notes/${id}`}>Credit Note Details</Link><span>Export PDF</span></Breadcrumbs>
    <header className="cn-page-heading"><div><span className="cn-eyebrow">CREDIT NOTE DOCUMENT</span><h1>Export Credit Note</h1><p>{note.number} <CreditNoteStatusBadge status={note.status} /></p></div><div className="cn-export-actions"><Button startIcon={<ArrowBack />} onClick={() => navigate(`/credit-notes/${id}`)}>Back to details</Button><Button variant="contained" disabled={busy} startIcon={<DownloadOutlined />} onClick={download}>{busy ? 'Generating…' : 'Download PDF'}</Button></div></header>
    <div className="cn-export-layout"><section className="cn-export-preview-panel"><div className="cn-export-panel-heading"><div><h2>Document preview</h2><p>Preview updates with the selected options.</p></div><PictureAsPdfOutlined /></div>
      <div className="cn-export-preview-stage"><article id="cn-export-document" className={`cn-export-paper ${orientation}`}>
        <header className="cn-export-paper-header"><div><strong>IBMS</strong><small>Billing &amp; Credit Management</small></div><div><span>CREDIT NOTE</span><b>{note.number}</b><small>{formatDate(note.date)}</small></div></header>
        <div className="cn-export-parties"><section><small>Customer</small><strong>{note.customer}</strong>{note.email && <span>{note.email}</span>}<span>Customer ID: {note.customerId || '—'}</span></section><section><small>Original invoice</small><strong>{note.invoiceNumber}</strong><span>Invoice total: {money(note.invoiceTotal || 0, note.currency)}</span></section></div>
        <table className="cn-export-table"><thead><tr><th>Description</th><th>Code</th><th>Qty</th><th>Unit price</th><th>Tax</th><th>Total</th></tr></thead><tbody>{(note.items || []).map((item, index) => <tr key={`${item.id}-${index}`}><td>{item.description}</td><td>{item.code || '—'}</td><td>{item.quantity}</td><td>{money(item.unitPrice, note.currency)}</td><td>{item.taxRate}%</td><td>{money(item.totalAmount, note.currency)}</td></tr>)}</tbody></table>
        <section className="cn-export-totals"><div><span>Credit subtotal</span><b>{money(note.subtotal, note.currency)}</b></div><div><span>Tax adjustment</span><b>{money(note.taxAmount, note.currency)}</b></div><div className="total"><span>Total credit</span><b>{money(note.total, note.currency)}</b></div></section>
        {note.reason && <section className="cn-export-note-section"><h3>Credit reason</h3><p>{note.reason}</p>{note.reasonNote && <p>{note.reasonNote}</p>}{note.reference && <small>Reference: {note.reference}</small>}</section>}
        {includeApprovals && approvalEvents.length > 0 && <section className="cn-export-note-section"><h3>Approval history</h3>{approvalEvents.map(([label, actor, date]) => <p key={label}>{label} · {actor || 'User unavailable'} · {formatDateTime(date)}</p>)}{note.rejectionReason && <p>Reason: {note.rejectionReason}</p>}</section>}
        {includeRefunds && <section className="cn-export-note-section"><h3>Refund summary</h3><p>Credit issued: {money(note.total, note.currency)} · Refunded: {money(note.refunded, note.currency)} · Remaining refundable: {money(note.remainingRefundable, note.currency)}</p>{(note.refundHistory || []).map((refund) => <p key={refund.id || refund.reference}>{refund.refundNumber || refund.reference || 'Refund'} · {formatDate(refund.date)} · {money(refund.amount, note.currency)}</p>)}</section>}
        {includeTimeline && note.timeline?.length > 0 && <section className="cn-export-note-section"><h3>Activity timeline</h3>{[...note.timeline].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map((event, index) => <p key={`${event.label}-${index}`}>{formatDateTime(event.timestamp)} · {event.label}{event.actor ? ` · ${event.actor}` : ''}</p>)}</section>}
        <footer className="cn-export-footer">Generated from IBMS · {note.number}</footer>
      </article></div></section>
      <aside className="cn-export-options-card"><h2>Export options</h2><label className="cn-export-field">File name<TextField size="small" value={filename || note.number} onChange={(event) => setFilename(event.target.value)} inputProps={{ 'aria-label': 'PDF file name' }} helperText={`Downloads as ${outputName}`} /></label><label className="cn-export-field">Orientation<TextField select size="small" value={orientation} onChange={(event) => setOrientation(event.target.value)}><MenuItem value="portrait">Portrait</MenuItem><MenuItem value="landscape">Landscape</MenuItem></TextField></label><fieldset className="cn-export-checks"><legend>Include sections</legend><label><input type="checkbox" checked={includeApprovals} onChange={(event) => setIncludeApprovals(event.target.checked)} /> Approval history</label><label><input type="checkbox" checked={includeRefunds} onChange={(event) => setIncludeRefunds(event.target.checked)} /> Refund summary</label><label><input type="checkbox" checked={includeTimeline} onChange={(event) => setIncludeTimeline(event.target.checked)} /> Audit timeline</label></fieldset><p className="cn-export-hint">A4 document. Preview updates automatically.</p>{error && <p className="cn-export-error" role="alert">{error}</p>}<Button fullWidth variant="contained" disabled={busy} startIcon={<DownloadOutlined />} onClick={download}>{busy ? 'Generating PDF…' : 'Download PDF'}</Button></aside>
    </div><FeedbackSnackbar message={notice} onClose={() => setNotice('')} />
  </main>;
}

export default CreditNoteExportPage;
