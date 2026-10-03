import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Print,
  Close,
  Receipt,
  Download,
  CheckCircle,
  ShareOutlined,
  ZoomIn,
  ZoomOut,
} from '@mui/icons-material';
import { InvoiceDocument } from './InvoiceDocument';

export const InvoicePreviewModal = ({ open, onClose, invoice }) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [scale, setScale] = useState(1);

  if (!invoice) return null;

  const invNumber = invoice.invoiceNumber || invoice.id || 'INV-DRAFT';
  const status = invoice.status || 'Draft';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(invoice, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${invNumber}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/invoices/${encodeURIComponent(invoice.id || invNumber)}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const zoomIn = () => setScale((s) => Math.min(s + 0.1, 1.2));
  const zoomOut = () => setScale((s) => Math.max(s - 0.1, 0.8));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '14px',
          overflow: 'hidden',
          backgroundColor: '#faf7f3',
          maxHeight: '94vh',
        },
      }}
    >
      {/* Top Modal Header */}
      <div
        className="invoice-preview-header no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 28px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #ebdccb',
          boxShadow: '0 2px 8px rgba(73, 44, 29, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#f5eee6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#70472f',
            }}
          >
            <Receipt sx={{ fontSize: 24 }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#241a14', fontWeight: 700 }}>
                Tax Invoice Preview
              </h3>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor:
                    status.toLowerCase() === 'paid'
                      ? '#dcf6e6'
                      : status.toLowerCase() === 'overdue'
                      ? '#ffe0e1'
                      : '#f3eae0',
                  color:
                    status.toLowerCase() === 'paid'
                      ? '#00814d'
                      : status.toLowerCase() === 'overdue'
                      ? '#e5292b'
                      : '#70472f',
                }}
              >
                {status}
              </span>
            </div>
            <span style={{ fontSize: '0.82rem', color: '#8c7d71' }}>
              Official Document #{invNumber} • Fortune 500 Ready Format
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Zoom controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#f5eee6',
              borderRadius: '6px',
              padding: '2px',
              marginRight: '6px',
            }}
          >
            <Tooltip title="Zoom Out">
              <IconButton size="small" onClick={zoomOut} disabled={scale <= 0.8}>
                <ZoomOut fontSize="small" />
              </IconButton>
            </Tooltip>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#70472f', padding: '0 6px' }}>
              {Math.round(scale * 100)}%
            </span>
            <Tooltip title="Zoom In">
              <IconButton size="small" onClick={zoomIn} disabled={scale >= 1.2}>
                <ZoomIn fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>

          <Tooltip title="Copy Shareable Link">
            <Button
              variant="outlined"
              size="small"
              startIcon={copiedLink ? <CheckCircle color="success" /> : <ShareOutlined />}
              onClick={handleCopyLink}
              sx={{
                textTransform: 'none',
                borderColor: '#d8c7b8',
                color: copiedLink ? '#00814d' : '#543420',
                fontWeight: 600,
                '&:hover': { borderColor: '#70472f', backgroundColor: '#fcfaf7' },
              }}
            >
              {copiedLink ? 'Copied' : 'Share'}
            </Button>
          </Tooltip>

          <Tooltip title="Download JSON Record">
            <Button
              variant="outlined"
              size="small"
              startIcon={<Download />}
              onClick={handleDownloadJson}
              sx={{
                textTransform: 'none',
                borderColor: '#d8c7b8',
                color: '#543420',
                fontWeight: 600,
                '&:hover': { borderColor: '#70472f', backgroundColor: '#fcfaf7' },
              }}
            >
              JSON
            </Button>
          </Tooltip>

          <Button
            variant="contained"
            size="small"
            startIcon={<Print />}
            onClick={handlePrint}
            sx={{
              backgroundColor: '#70472f',
              '&:hover': { backgroundColor: '#583623' },
              textTransform: 'none',
              fontWeight: 700,
              padding: '6px 16px',
              boxShadow: '0 2px 8px rgba(112, 71, 47, 0.25)',
            }}
          >
            Print / Save PDF
          </Button>

          <IconButton onClick={onClose} size="small" aria-label="Close invoice preview" sx={{ ml: 1 }}>
            <Close />
          </IconButton>
        </div>
      </div>

      {/* Main Content: High-End Invoice Document */}
      <DialogContent
        sx={{
          p: { xs: 1.5, sm: 3, md: 4 },
          backgroundColor: '#f4efe9',
          display: 'flex',
          justifyContent: 'center',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <InvoiceDocument invoice={invoice} />
        </div>
      </DialogContent>

      {/* Bottom Modal Actions */}
      <DialogActions
        className="no-print"
        sx={{
          p: 2,
          px: 3,
          backgroundColor: '#ffffff',
          borderTop: '1px solid #ebdccb',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '0.8rem', color: '#8c7d71' }}>
          Compliant with GST Rule 48 • Instant UPI QR Settlement Enabled
        </span>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button onClick={onClose} variant="outlined" sx={{ textTransform: 'none', color: '#543420', borderColor: '#d8c7b8' }}>
            Close Preview
          </Button>
          <Button
            onClick={handlePrint}
            variant="contained"
            startIcon={<Print />}
            sx={{ backgroundColor: '#70472f', '&:hover': { backgroundColor: '#583623' }, textTransform: 'none' }}
          >
            Print Invoice
          </Button>
        </div>
      </DialogActions>
    </Dialog>
  );
};

export default InvoicePreviewModal;
