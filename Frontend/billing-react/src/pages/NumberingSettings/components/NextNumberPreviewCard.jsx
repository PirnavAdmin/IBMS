import React from 'react';
import {
  VisibilityOutlined,
  FormatListNumberedOutlined,
  CheckCircle,
  LightbulbOutlined,
} from '@mui/icons-material';
import { generateNumberPreview } from '../validation/numberingValidation';

export const NextNumberPreviewCard = ({ formValues = {} }) => {
  const {
    documentType = 'Invoice',
    prefix = '',
    suffix = '',
    tokens = '',
    sequenceLength = 4,
    nextNumber = 42,
    resetPolicy = 'Never (Continuous sequence)',
  } = formValues;

  const preview = generateNumberPreview({
    documentType,
    prefix,
    suffix,
    tokens,
    sequenceLength,
    nextNumber,
  });

  const nextSeq1 = (parseInt(nextNumber, 10) || 1) + 1;
  const nextSeq2 = (parseInt(nextNumber, 10) || 1) + 2;

  const previewNext1 = generateNumberPreview({
    documentType,
    prefix,
    suffix,
    tokens,
    sequenceLength,
    nextNumber: nextSeq1,
  }).fullPreview;

  const previewNext2 = generateNumberPreview({
    documentType,
    prefix,
    suffix,
    tokens,
    sequenceLength,
    nextNumber: nextSeq2,
  }).fullPreview;

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
          <p>See how your document numbers are generated.</p>
        </div>
      </div>

      {/* Main Preview Card */}
      <div className="preview-main-card">
        <div className="preview-main-label">NEXT {docTypeName} NUMBER</div>
        <div className="preview-main-number">
          {preview.fullPreview || '---'}
        </div>
        <div className="preview-badge-row">
          <span className="valid-format-badge">
            <CheckCircle style={{ fontSize: '0.95rem' }} />
            Valid format
          </span>
        </div>
      </div>

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

      {/* Upcoming Numbers Section */}
      <div className="preview-section">
        <h4 className="with-icon">
          <span className="section-icon-badge">
            <FormatListNumberedOutlined style={{ fontSize: '1rem' }} />
          </span>
          Upcoming Numbers
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
