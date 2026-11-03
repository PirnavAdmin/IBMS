import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Close from '@mui/icons-material/Close';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import { auditEventLabel, auditDate, auditSnapshot, formatAuditChanges } from './auditModel.js';

function hasStructuredAuditValue(value) {
  if (value && typeof value === 'object') return true;
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object';
  } catch {
    return false;
  }
}

export function AuditEventDetailsDialog({ selected, onClose }) {
  const [copyNotice, setCopyNotice] = useState('');
  useEffect(() => { setCopyNotice(''); }, [selected?.id]);

  const copyAuditSnapshot = async (value, label) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(auditSnapshot(value));
      setCopyNotice(`${label} copied to clipboard.`);
    } catch {
      setCopyNotice(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  return <Dialog open={Boolean(selected)} onClose={onClose} aria-labelledby="audit-detail-title" maxWidth="md" fullWidth PaperProps={{ className: 'audit-detail-dialog' }}>
    {selected && <>
      <DialogTitle className="audit-detail-title">
        <div className="audit-detail-title-content">
          <h2 id="audit-detail-title">Audit event details</h2>
          <span className="audit-detail-number">#{selected.id}</span>
          <span className="audit-detail-event">{auditEventLabel(selected.action)}</span>
        </div>
        <IconButton className="audit-detail-close" aria-label="Close audit event details" onClick={onClose}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent className="audit-detail-content">
        <dl className="audit-detail-fields">
          {[
            ['Date and time (IST)', auditDate(selected.timestamp)], ['Performed by', selected.userName],
            ['Module / entity', selected.entityName], ['Record ID', selected.entityId],
          ].map(([label, value]) => <div className="audit-detail-field" key={label}>
            <dt>{label}</dt><dd>{value || '—'}</dd>
          </div>)}
        </dl>
        <section className="audit-detail-summary" aria-labelledby="audit-detail-summary-title">
          <h3 id="audit-detail-summary-title">Changes / result</h3>
          <p>{formatAuditChanges(selected.changes) || 'No change details recorded.'}</p>
        </section>
        <div className="audit-snapshots">
          {[
            ['Previous values', selected.oldValues], ['New values', selected.newValues],
          ].map(([title, value]) => {
            const missing = !value;
            const structured = hasStructuredAuditValue(value);
            const snapshot = auditSnapshot(value);
            return <section className="audit-snapshot-panel" key={title}>
              <div className="audit-snapshot-heading">
                <h3>{title}</h3>
                {structured && <IconButton size="small" aria-label={`Copy ${title.toLowerCase()}`}
                  onClick={() => copyAuditSnapshot(value, title)}><ContentCopyOutlined fontSize="small" /></IconButton>}
              </div>
              {missing ? <p className="audit-snapshot-empty">Not recorded</p>
                : <pre className="audit-snapshot-value">{snapshot}</pre>}
            </section>;
          })}
        </div>
        <span className="audit-copy-status" role="status" aria-live="polite">{copyNotice}</span>
      </DialogContent>
      <DialogActions className="audit-detail-actions">
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </>}
  </Dialog>;
}
