import React from 'react';
import {
  DOCUMENT_TYPES,
  RESET_POLICIES,
  SUPPORTED_TOKENS,
} from '../validation/numberingValidation';
import {
  DescriptionOutlined,
  PinOutlined,
  SaveOutlined,
  RestartAltOutlined,
  InfoOutlined,
  BoltOutlined,
} from '@mui/icons-material';
import { CircularProgress } from '@mui/material';

export const NumberingSettingsForm = ({
  register,
  errors,
  watch,
  setValue,
  onSubmit,
  isSubmitting = false,
  onResetDefaults,
  onDocumentTypeChange,
}) => {
  const currentTokens = watch('tokens') || '';
  const currentDocType = watch('documentType') || 'Invoice';

  const handleTokenClick = (token) => {
    const nextVal = currentTokens ? `${currentTokens}${token}` : `${token}-`;
    setValue('tokens', nextVal, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <form className="num-form-card" onSubmit={onSubmit} noValidate>
      {/* 1. DOCUMENT CONFIGURATION */}
      <section className="num-section">
        <div className="num-section-head">
          <h2>
            <DescriptionOutlined />
            Document Configuration
          </h2>
          <p>Specify the document type and surrounding affix characters</p>
        </div>

        {/* Document Type Field */}
        <div className={`num-field ${errors.documentType ? 'has-error' : ''}`}>
          <label htmlFor="num-doc-type">
            Document Type <span className="required-star">*</span>
          </label>
          <div className="num-input-wrap">
            <select
              id="num-doc-type"
              {...register('documentType')}
              onChange={(e) => {
                register('documentType').onChange(e);
                if (onDocumentTypeChange) {
                  onDocumentTypeChange(e.target.value);
                }
              }}
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          {errors.documentType && (
            <span className="num-error-msg">{errors.documentType.message}</span>
          )}
          <span className="num-hint">
            Each document type maintains its own independent sequence rules and formatting.
          </span>
        </div>

        {/* Prefix and Suffix Fields in 2 columns */}
        <div className="num-grid-2">
          <div className={`num-field ${errors.prefix ? 'has-error' : ''}`}>
            <label htmlFor="num-prefix">Prefix</label>
            <div className="num-input-wrap">
              <input
                id="num-prefix"
                type="text"
                placeholder="e.g. INV-"
                maxLength={20}
                {...register('prefix')}
              />
            </div>
            {errors.prefix && (
              <span className="num-error-msg">{errors.prefix.message}</span>
            )}
            <span className="num-hint">Static code placed before the sequence (e.g. INV-, BILL-)</span>
          </div>

          <div className={`num-field ${errors.suffix ? 'has-error' : ''}`}>
            <label htmlFor="num-suffix">Suffix</label>
            <div className="num-input-wrap">
              <input
                id="num-suffix"
                type="text"
                placeholder="e.g. -2026 or /IN"
                maxLength={20}
                {...register('suffix')}
              />
            </div>
            {errors.suffix && (
              <span className="num-error-msg">{errors.suffix.message}</span>
            )}
            <span className="num-hint">Optional static code appended to the document number</span>
          </div>
        </div>
      </section>

      {/* 2. NUMBERING FORMAT */}
      <section className="num-section">
        <div className="num-section-head">
          <h2>
            <PinOutlined />
            Numbering Format & Sequence
          </h2>
          <p>Define date token patterns, zero-padding, and automatic reset policies</p>
        </div>

        {/* Tokens Expression Input */}
        <div className={`num-field ${errors.tokens ? 'has-error' : ''}`}>
          <label htmlFor="num-tokens">
            Date & Period Tokens
          </label>
          <div className="num-input-wrap">
            <input
              id="num-tokens"
              type="text"
              placeholder="e.g. (YEAR)- or (FY)/"
              maxLength={30}
              {...register('tokens')}
            />
          </div>
          {errors.tokens && (
            <span className="num-error-msg">{errors.tokens.message}</span>
          )}
          <span className="num-hint">
            Tokens evaluate dynamically using the invoice creation date.
          </span>

          {/* Token helper chips */}
          <div className="num-tokens-panel">
            <div className="num-tokens-panel-label">
              <BoltOutlined style={{ fontSize: '0.95rem' }} />
              Click token to insert:
            </div>
            <div className="num-token-chips">
              {SUPPORTED_TOKENS.map((t) => (
                <button
                  type="button"
                  key={t.token}
                  className="num-token-chip"
                  onClick={() => handleTokenClick(t.token)}
                  title={`Insert ${t.token} (${t.desc})`}
                >
                  <strong>{t.token}</strong>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sequence Length & Next Number in 2 columns */}
        <div className="num-grid-2">
          <div className={`num-field ${errors.sequenceLength ? 'has-error' : ''}`}>
            <label htmlFor="num-seq-len">
              Sequence Length (Digits) <span className="required-star">*</span>
            </label>
            <div className="num-input-wrap">
              <select id="num-seq-len" {...register('sequenceLength')}>
                <option value={3}>3 Digits (001)</option>
                <option value={4}>4 Digits (0001)</option>
                <option value={5}>5 Digits (00001)</option>
                <option value={6}>6 Digits (000001)</option>
                <option value={7}>7 Digits (0000001)</option>
                <option value={8}>8 Digits (00000001)</option>
              </select>
            </div>
            {errors.sequenceLength && (
              <span className="num-error-msg">{errors.sequenceLength.message}</span>
            )}
            <span className="num-hint">Controls zero-padding on the sequence number</span>
          </div>

          <div className={`num-field ${errors.nextNumber ? 'has-error' : ''}`}>
            <label htmlFor="num-next-num">
              Next Sequence Number <span className="required-star">*</span>
            </label>
            <div className="num-input-wrap">
              <input
                id="num-next-num"
                type="number"
                min={1}
                step={1}
                placeholder="e.g. 1 or 42"
                {...register('nextNumber')}
              />
            </div>
            {errors.nextNumber && (
              <span className="num-error-msg">{errors.nextNumber.message}</span>
            )}
            <span className="num-hint">Next numeric counter that will be assigned</span>
          </div>
        </div>

        {/* Reset Policy Dropdown */}
        <div className={`num-field ${errors.resetPolicy ? 'has-error' : ''}`} style={{ marginTop: '16px' }}>
          <label htmlFor="num-reset-policy">
            Reset Policy <span className="required-star">*</span>
          </label>
          <div className="num-input-wrap">
            <select id="num-reset-policy" {...register('resetPolicy')}>
              {RESET_POLICIES.map((policy) => (
                <option key={policy} value={policy}>
                  {policy === 'Never' && 'Never (Continuous sequence)'}
                  {policy === 'Yearly' && 'Yearly (Resets to 1 each calendar year on Jan 1)'}
                  {policy === 'Financial Year' && 'Financial Year (Resets to 1 each FY on Apr 1)'}
                  {policy === 'Monthly' && 'Monthly (Resets to 1 on the 1st of each month)'}
                  {policy === 'Daily' && 'Daily (Resets to 1 each day)'}
                </option>
              ))}
            </select>
          </div>
          {errors.resetPolicy && (
            <span className="num-error-msg">{errors.resetPolicy.message}</span>
          )}
          <span className="num-hint">
            Defines when the sequence counter automatically cycles back to 1.
          </span>
        </div>
      </section>

      {/* 3. FORM FOOTER ACTIONS */}
      <footer className="num-form-footer">
        <button
          type="button"
          className="num-btn num-btn-outline"
          onClick={onResetDefaults}
          disabled={isSubmitting}
        >
          <RestartAltOutlined style={{ fontSize: '1.1rem' }} />
          Reset to Defaults
        </button>

        <button
          type="submit"
          className="num-btn num-btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <CircularProgress size={18} color="inherit" />
              Saving Settings...
            </>
          ) : (
            <>
              <SaveOutlined style={{ fontSize: '1.1rem' }} />
              Save Configuration
            </>
          )}
        </button>
      </footer>
    </form>
  );
};

export default NumberingSettingsForm;
