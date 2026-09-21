import React from 'react';
import {
  generateNumberPreview,
  SUPPORTED_TOKENS,
} from '../validation/numberingValidation';
import {
  VisibilityOutlined,
  BoltOutlined,
  CalendarMonthOutlined,
  InfoOutlined,
} from '@mui/icons-material';

const RESET_DESCRIPTIONS = {
  Never: 'Sequence numbers continue sequentially without resetting.',
  Yearly: 'Sequence resets to 1 on January 1st of every calendar year.',
  'Financial Year': 'Sequence resets to 1 on April 1st of every Indian Financial Year.',
  Monthly: 'Sequence resets to 1 on the 1st of each calendar month.',
  Daily: 'Sequence resets to 1 at 00:00 every day.',
};

export const NextNumberPreviewCard = ({ formValues = {}, onInsertToken }) => {
  const {
    documentType = 'Invoice',
    prefix = '',
    suffix = '',
    tokens = '',
    sequenceLength = 4,
    nextNumber = 1,
    resetPolicy = 'Financial Year',
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

  return (
    <div className="num-preview-sticky">
      <aside className="num-preview-card" aria-label="Next Number Preview">
        <div className="num-preview-head">
          <h3>
            <VisibilityOutlined />
            Next Number Preview
          </h3>
          <span className="live-indicator">
            <span className="live-dot" />
            Live Preview
          </span>
        </div>

        <div className="num-preview-display">
          <small>{documentType} Sequence</small>
          <span className="num-derived-number-label">{documentType} Number</span>
          <div className="preview-text" title={preview.fullPreview || 'Incomplete Configuration'}>
            {preview.fullPreview || '---'}
          </div>
        </div>

        {/* Structure Breakdown */}
        <div className="num-breakdown-section">
          <div className="num-breakdown-title">Pattern Breakdown</div>
          <div className="num-breakdown-grid">
            <div className="num-breakdown-item">
              <span>Prefix</span>
              <strong>{preview.parts.prefix || '(none)'}</strong>
            </div>
            <div className="num-breakdown-item">
              <span>Tokens</span>
              <strong>{preview.parts.tokens || '(none)'}</strong>
            </div>
            <div className="num-breakdown-item">
              <span>Sequence ({sequenceLength} digits)</span>
              <strong>{preview.parts.sequence}</strong>
            </div>
            <div className="num-breakdown-item">
              <span>Suffix</span>
              <strong>{preview.parts.suffix || '(none)'}</strong>
            </div>
          </div>
        </div>

        {/* Next in Sequence */}
        <div className="num-progression-section">
          <h4>Upcoming Sequence</h4>
          <div className="num-progression-list">
            <div className="num-progression-item">
              <span>Next Document</span>
              <strong>{preview.fullPreview}</strong>
            </div>
            <div className="num-progression-item">
              <span>Following Document</span>
              <strong>{previewNext1}</strong>
            </div>
            <div className="num-progression-item">
              <span>Subsequent Document</span>
              <strong>{previewNext2}</strong>
            </div>
          </div>
        </div>

        {/* Reset Rule explanation */}
        <div style={{ marginTop: '18px', padding: '12px', background: '#faf6f1', borderRadius: '8px', border: '1px solid #ebd8ca', fontSize: '0.74rem', color: '#665345', display: 'flex', gap: '8px' }}>
          <CalendarMonthOutlined style={{ fontSize: '1.1rem', color: '#8b451f', flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong style={{ display: 'block', color: '#3a2012', marginBottom: '2px' }}>
              Reset Rule: {resetPolicy}
            </strong>
            <span>{RESET_DESCRIPTIONS[resetPolicy] || 'Configured reset policy.'}</span>
          </div>
        </div>

        {/* Quick Token Reference */}
        {onInsertToken && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#7a6353', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BoltOutlined style={{ fontSize: '1rem', color: '#d4864f' }} />
              Quick Token Insert
            </div>
            <div className="num-token-chips">
              {SUPPORTED_TOKENS.map((t) => (
                <button
                  type="button"
                  key={t.token}
                  className="num-token-chip"
                  onClick={() => onInsertToken(t.token)}
                  title={`${t.desc} — click to insert into tokens`}
                >
                  {t.token}
                  <small>({t.example})</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
};

export default NextNumberPreviewCard;
