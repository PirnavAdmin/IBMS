import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  Select,
  Snackbar,
  TextField,
} from '@mui/material';
import {
  RestartAlt,
  SaveOutlined,
  DeleteOutline,
  HelpOutline,
  CheckCircle,
} from '@mui/icons-material';
import {
  DOCUMENT_TYPES,
  RESET_POLICIES,
  DEFAULT_NUMBERING_CONFIG,
  DEFAULT_PRESETS_BY_DOC_TYPE,
  numberingValidationSchema,
} from '../validation/numberingValidation';
import { numberingService } from '../services/numberingService';
import { DocumentTypeSelector } from '../components/DocumentTypeSelector';
import { FormatBuilder } from '../components/FormatBuilder';
import { NextNumberPreviewCard } from '../components/NextNumberPreviewCard';
import '../styles/numbering-settings.css';

export function NumberingSettings() {
  const navigate = useNavigate();
  const requestLock = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [toast, setToast] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(numberingValidationSchema),
    defaultValues: DEFAULT_NUMBERING_CONFIG,
    mode: 'onTouched',
  });

  const currentDocType = watch('documentType') || 'Invoice';
  const currentPrefix = watch('prefix') || '';
  const currentSuffix = watch('suffix') || '';
  const currentTokens = watch('tokens') || '';
  const currentSeqLength = watch('sequenceLength') || 4;
  const currentNextNum = watch('nextNumber') || 42;
  const currentResetPolicy = watch('resetPolicy') || 'Never (Continuous sequence)';

  // Load configuration for document type
  const loadSettingsForType = useCallback(async (docType) => {
    setIsLoading(true);
    setApiError('');
    const preset = DEFAULT_PRESETS_BY_DOC_TYPE[docType] || DEFAULT_NUMBERING_CONFIG;
    try {
      const data = await numberingService.getSettings(docType);
      if (data) {
        // Normalize any backend curly braces to normal brackets for the UI
        const normalizedTokens = (data.tokens || preset.tokens)
          .replace(/\{/g, '(')
          .replace(/\}/g, ')');

        reset({
          documentType: data.documentType || docType,
          prefix: (data.prefix || preset.prefix).replace(/\{/g, '(').replace(/\}/g, ')'),
          suffix: (data.suffix || preset.suffix).replace(/\{/g, '(').replace(/\}/g, ')'),
          tokens: normalizedTokens,
          sequenceLength: Number(data.sequenceLength || preset.sequenceLength || 4),
          nextNumber: Number(data.nextNumber || preset.nextNumber || 1),
          resetPolicy: data.resetPolicy || preset.resetPolicy || 'Never (Continuous sequence)',
        });
      } else {
        reset({
          ...preset,
          documentType: docType,
        });
      }
    } catch (err) {
      console.warn('API getSettings error, falling back to preset:', err);
      reset({
        ...preset,
        documentType: docType,
      });
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  useEffect(() => {
    loadSettingsForType(currentDocType);
  }, [loadSettingsForType]);

  // Handle switching document type
  const handleSelectDocType = (docType) => {
    setValue('documentType', docType);
    loadSettingsForType(docType);
  };

  // Reset to default preset
  const handleResetChanges = () => {
    const preset =
      DEFAULT_PRESETS_BY_DOC_TYPE[currentDocType] || DEFAULT_NUMBERING_CONFIG;
    reset({
      ...preset,
      documentType: currentDocType,
    });
    setToast(`Reset changes for ${currentDocType} to default format.`);
  };

  // Append token
  const handleAddToken = (token) => {
    const existing = currentTokens || '';
    const nextVal = existing ? `${existing}${token}-` : `${token}-`;
    setValue('tokens', nextVal, { shouldValidate: true, shouldDirty: true });
  };

  // Clear middle tokens
  const handleClearTokens = () => {
    setValue('tokens', '', { shouldValidate: true, shouldDirty: true });
    setToast('Cleared format tokens.');
  };

  // Save handler
  const onSave = async (isDraft = false) => {
    if (requestLock.current || isSubmitting) return;
    requestLock.current = true;
    setIsSubmitting(true);
    setApiError('');

    try {
      // Convert normal brackets to backend token format if present
      const toBackendTokens = (val) => (val || '').replace(/\(/g, '{').replace(/\)/g, '}');

      const payload = {
        documentType: currentDocType,
        prefix: toBackendTokens((currentPrefix || '').trim()),
        suffix: toBackendTokens((currentSuffix || '').trim()),
        tokens: toBackendTokens((currentTokens || '').trim()),
        sequenceLength: parseInt(currentSeqLength, 10),
        nextNumber: parseInt(currentNextNum, 10),
        resetPolicy: currentResetPolicy,
        status: isDraft ? 'Draft' : 'Active',
      };

      const result = await numberingService.updateSettings(payload);
      if (result) {
        reset({
          documentType: result.documentType || currentDocType,
          prefix: (result.prefix ?? currentPrefix).replace(/\{/g, '(').replace(/\}/g, ')'),
          suffix: (result.suffix ?? currentSuffix).replace(/\{/g, '(').replace(/\}/g, ')'),
          tokens: (result.tokens ?? currentTokens).replace(/\{/g, '(').replace(/\}/g, ')'),
          sequenceLength: Number(result.sequenceLength ?? currentSeqLength),
          nextNumber: Number(result.nextNumber ?? currentNextNum),
          resetPolicy: result.resetPolicy || currentResetPolicy,
        });
      }
      setToast(
        isDraft
          ? `Numbering format for ${currentDocType} saved as draft.`
          : `Numbering settings for ${currentDocType} saved successfully.`
      );
    } catch (err) {
      setApiError(err.userMessage || err.message || 'Failed to save numbering settings.');
    } finally {
      requestLock.current = false;
      setIsSubmitting(false);
    }
  };

  const formValues = {
    documentType: currentDocType,
    prefix: currentPrefix,
    suffix: currentSuffix,
    tokens: currentTokens,
    sequenceLength: currentSeqLength,
    nextNumber: currentNextNum,
    resetPolicy: currentResetPolicy,
  };

  return (
    <div className="numbering-page-root">
      {/* Top Breadcrumbs */}
      <nav className="numbering-breadcrumbs" aria-label="Breadcrumb">
        <span
          className="crumb-root"
          onClick={() => navigate('/settings')}
          style={{ cursor: 'pointer' }}
          title="Back to Settings"
        >
          Settings
        </span>
        <span className="crumb-sep">&gt;</span>
        <span className="crumb-mid">General Settings</span>
        <span className="crumb-sep">&gt;</span>
        <span className="crumb-current">Invoice Numbering</span>
      </nav>

      {/* Page Title & Decorative Header */}
      <header className="numbering-hero-header">
        <div className="numbering-hero-titles">
          <h1>Invoice Numbering Configuration</h1>
          <p>
            Define how your document numbers are generated. Use tokens, set sequence rules, and preview in real-time.
          </p>
        </div>

        {/* Decorative Quote Banner matching mockup */}
        <div className="numbering-quote-card" aria-hidden="true">
          <div className="quote-card-glow" />
          <div className="quote-text-wrap">
            <span className="quote-line-1">Organize today,</span>
            <span className="quote-line-2">Invoice better tomorrow</span>
          </div>
          <div className="quote-invoice-icon">
            <div className="mini-invoice-sheet">
              <div className="mini-invoice-line" style={{ width: '60%' }} />
              <div className="mini-invoice-line" style={{ width: '80%' }} />
              <div className="mini-invoice-line" style={{ width: '40%' }} />
            </div>
          </div>
        </div>
      </header>

      {/* Error Alert */}
      {apiError && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => loadSettingsForType(currentDocType)}>
              Retry
            </Button>
          }
        >
          {apiError}
        </Alert>
      )}

      {/* Main 2-Column Layout */}
      <div className="numbering-content-grid">
        {/* Left Column: Configuration Steps 1, 2, 3 */}
        <div className="numbering-steps-column">
          {/* STEP 1: Select Document Type */}
          <section className="numbering-card-panel">
            <div className="panel-step-header">
              <div className="panel-step-badge">1</div>
              <div className="panel-step-titles">
                <h2>Select Document Type</h2>
                <p>Choose the document type to configure numbering for.</p>
              </div>
              <a
                href="#help"
                className="panel-help-link"
                onClick={(e) => {
                  e.preventDefault();
                  setToast('Select any document type to configure its independent sequence format.');
                }}
              >
                <HelpOutline style={{ fontSize: '1rem' }} />
                Need help?
              </a>
            </div>

            <DocumentTypeSelector
              selectedType={currentDocType}
              onSelectType={handleSelectDocType}
            />
          </section>

          {/* STEP 2: Configure Format & Sequence */}
          <section className="numbering-card-panel">
            <div className="panel-step-header">
              <div className="panel-step-badge">2</div>
              <div className="panel-step-titles">
                <h2>Configure Format &amp; Sequence</h2>
                <p>Set the prefix, suffix, date tokens, sequence and reset rules.</p>
              </div>
            </div>

            <div className="numbering-fields-grid">
              {/* Prefix */}
              <div className="form-field-group">
                <label htmlFor="prefix-input">
                  Prefix <span className="req-star">*</span>
                </label>
                <input
                  id="prefix-input"
                  type="text"
                  placeholder="e.g. INV-001"
                  value={currentPrefix}
                  onChange={(e) => setValue('prefix', e.target.value, { shouldValidate: true })}
                />
                <span className="field-helper-text">Static code placed before sequence</span>
                {errors.prefix && <span className="field-error-text">{errors.prefix.message}</span>}
              </div>

              {/* Suffix */}
              <div className="form-field-group">
                <label htmlFor="suffix-input">Suffix</label>
                <input
                  id="suffix-input"
                  type="text"
                  placeholder="e.g. 2026"
                  value={currentSuffix}
                  onChange={(e) => setValue('suffix', e.target.value, { shouldValidate: true })}
                />
                <span className="field-helper-text">Optional code appended to sequence</span>
                {errors.suffix && <span className="field-error-text">{errors.suffix.message}</span>}
              </div>

              {/* Sequence Length */}
              <div className="form-field-group">
                <label htmlFor="seq-len-select">
                  Sequence Length (Digits) <span className="req-star">*</span>
                </label>
                <select
                  id="seq-len-select"
                  value={Number(currentSeqLength)}
                  onChange={(e) => setValue('sequenceLength', Number(e.target.value), { shouldValidate: true })}
                >
                  <option value={3}>3 Digits (001)</option>
                  <option value={4}>4 Digits (0001)</option>
                  <option value={5}>5 Digits (00001)</option>
                  <option value={6}>6 Digits (000001)</option>
                  <option value={7}>7 Digits (0000001)</option>
                  <option value={8}>8 Digits (00000001)</option>
                </select>
                <span className="field-helper-text">Total digits for the sequence number</span>
              </div>

              {/* Next Sequence Number */}
              <div className="form-field-group">
                <label htmlFor="next-num-input">
                  Next Sequence Number <span className="req-star">*</span>
                </label>
                <input
                  id="next-num-input"
                  type="number"
                  min={1}
                  step={1}
                  value={currentNextNum}
                  onChange={(e) => setValue('nextNumber', e.target.value === '' ? '' : Number(e.target.value), { shouldValidate: true })}
                />
                <span className="field-helper-text">Next counter to be assigned</span>
                {errors.nextNumber && <span className="field-error-text">{errors.nextNumber.message}</span>}
              </div>

              {/* Reset Policy (Full Width) */}
              <div className="form-field-group is-full-width">
                <label htmlFor="reset-policy-select">
                  Reset Policy <span className="req-star">*</span>
                </label>
                <select
                  id="reset-policy-select"
                  value={currentResetPolicy}
                  onChange={(e) => setValue('resetPolicy', e.target.value, { shouldValidate: true })}
                >
                  {RESET_POLICIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <span className="field-helper-text">
                  {currentResetPolicy.includes('(')
                    ? currentResetPolicy.split('(')[1].replace(')', '')
                    : 'Sequence numbers continue sequentially without resetting.'}
                </span>
              </div>
            </div>
          </section>

          {/* STEP 3: Build Your Format */}
          <section className="numbering-card-panel">
            <div className="panel-step-header">
              <div className="panel-step-badge">3</div>
              <div className="panel-step-titles">
                <h2>Build Your Format</h2>
                <p>Drag and drop tokens to build your numbering format.</p>
              </div>
              <button
                type="button"
                className="panel-clear-btn"
                onClick={handleClearTokens}
                title="Clear all tokens"
              >
                <DeleteOutline style={{ fontSize: '1.05rem' }} />
                Clear All
              </button>
            </div>

            <FormatBuilder
              prefix={currentPrefix}
              suffix={currentSuffix}
              tokens={currentTokens}
              onAddToken={handleAddToken}
              onClearTokens={handleClearTokens}
            />
          </section>
        </div>

        {/* Right Column: Live Preview Panel */}
        <NextNumberPreviewCard formValues={formValues} />
      </div>

      {/* Bottom Sticky Action Bar */}
      <footer className="numbering-bottom-bar">
        <div className="bottom-bar-left">
          <button
            type="button"
            className="bar-btn bar-btn-outline"
            onClick={handleResetChanges}
            disabled={isSubmitting}
          >
            <RestartAlt style={{ fontSize: '1.1rem' }} />
            Reset Changes
          </button>
        </div>

        <div className="bottom-bar-right">
          <button
            type="button"
            className="bar-btn bar-btn-outline"
            onClick={() => onSave(true)}
            disabled={isSubmitting}
          >
            <SaveOutlined style={{ fontSize: '1.1rem' }} />
            Save as Draft
          </button>

          <button
            type="button"
            className="bar-btn bar-btn-primary"
            onClick={() => onSave(false)}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <CircularProgress size={16} color="inherit" />
                Saving...
              </>
            ) : (
              <>
                <SaveOutlined style={{ fontSize: '1.1rem' }} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </footer>

      {/* Snackbar Toast */}
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3500}
        onClose={() => setToast('')}
        message={toast}
      />
    </div>
  );
}

export default NumberingSettings;
