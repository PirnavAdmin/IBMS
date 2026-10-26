import React, { useEffect, useState } from 'react';
import {
  VisibilityOutlined,
  FormatListNumberedOutlined,
  CheckCircle,
  LightbulbOutlined,
} from '@mui/icons-material';
import { numberingValidationSchema } from '../validation/numberingValidation';
import { numberingService } from '../services/numberingService';

export const NextNumberPreviewCard = ({ formValues = {}, enabled = true }) => {
  const {
    documentType = 'Invoice',
    prefix = '',
    suffix = '',
    tokens = '',
    sequenceLength = 4,
    nextNumber = '',
    resetPolicy = 'Never (Continuous sequence)',
  } = formValues;

  const valid = enabled && numberingValidationSchema.isValidSync(formValues);
  const requestKey = JSON.stringify({ documentType, prefix, suffix, tokens, sequenceLength, nextNumber });
  const [state, setState] = useState({ key: '', previews: [], error: '' });
  useEffect(() => {
    if (!valid) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const values = JSON.parse(requestKey);
        // Preview is read-only; never call the consuming /generate endpoint.
        const previews = await Promise.all([0, 1, 2].map(offset => numberingService.preview({ ...values, nextNumber: Number(values.nextNumber) + offset })));
        if (active) setState({ key: requestKey, previews, error: '' });
      } catch (error) {
        if (active) setState({ key: requestKey, previews: [], error: error.userMessage || error.message || 'Preview unavailable.' });
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [requestKey, valid]);
  const current = valid && state.key === requestKey;
  const preview = current && state.previews[0] || { fullPreview: '---', parts: {} };
  const previewNext1 = current && state.previews[1]?.fullPreview || '---';
  const previewNext2 = current && state.previews[2]?.fullPreview || '---';
  const ready = current && state.previews.length > 0;

  const docTypeName = documentType.toUpperCase();

  return (
    <aside className="preview-column" aria-label="Live Preview">
      {/* Header */}
      <div className="preview-header">
        <div className="preview-header-icon">
          <VisibilityOutlined style={{ fontSize: '1.25rem' }} />
        </div>
        <div>
          <h3>Live Preview</h3>
          <p>Server format examples. Numbers are not reserved.</p>
        </div>
      </div>

      {/* Main Preview Card */}
      <div className="preview-main-card">
        <div className="preview-main-label">NEXT {docTypeName} NUMBER</div>
        <div className="preview-main-number">
          {preview.fullPreview}
        </div>
        <div className="preview-badge-row">
          <span className="valid-format-badge">
            {ready && <CheckCircle style={{ fontSize: '0.95rem' }} />}
            {ready ? 'Server preview' : valid ? 'Loading preview' : 'Check format values'}
          </span>
        </div>
      </div>

      {current && state.error && <p role="alert">{state.error}</p>}
      {/* Breakdown Section */}
      <div className="preview-section">
        <h4>Breakdown</h4>
        <div className="preview-table">
          <div className="preview-table-row">
            <span className="row-label">Prefix</span>
            <span className="row-value">{preview.parts.prefix || '(none)'}</span>
          </div>
          <div className="preview-table-row">
            <span className="row-label">Date Tokens</span>
            <span className="row-value">{preview.parts.tokens || '(none)'}</span>
          </div>
          <div className="preview-table-row">
            <span className="row-label">Sequence ({sequenceLength} digits)</span>
            <span className="row-value">{preview.parts.sequence}</span>
          </div>
          <div className="preview-table-row">
            <span className="row-label">Suffix</span>
            <span className="row-value">{preview.parts.suffix || '(none)'}</span>
          </div>
        </div>
      </div>

      {/* Upcoming Format Examples Section */}
      <div className="preview-section">
        <h4 className="with-icon">
          <span className="section-icon-badge">
            <FormatListNumberedOutlined style={{ fontSize: '1rem' }} />
          </span>
          Upcoming Format Examples
        </h4>
        <div className="preview-table">
          <div className="preview-table-row">
            <span className="row-label">Next Document</span>
            <span className="row-value monospace">{preview.fullPreview}</span>
          </div>
          <div className="preview-table-row">
            <span className="row-label">Following Document</span>
            <span className="row-value monospace">{previewNext1}</span>
          </div>
          <div className="preview-table-row">
            <span className="row-label">Subsequent Document</span>
            <span className="row-value monospace">{previewNext2}</span>
          </div>
        </div>
      </div>

      {/* Reset Rule Notice */}
      <div className="reset-rule-card">
        <div className="reset-rule-icon">
          <LightbulbOutlined style={{ fontSize: '1.15rem' }} />
        </div>
        <div className="reset-rule-body">
          <strong>Reset Rule: {resetPolicy.split('(')[0].trim()}</strong>
          <p>
            {resetPolicy.includes('(')
              ? resetPolicy.split('(')[1].replace(')', '')
              : 'Configured reset sequence rule for this document.'}
          </p>
        </div>
      </div>
    </aside>
  );
};

export default NextNumberPreviewCard;
