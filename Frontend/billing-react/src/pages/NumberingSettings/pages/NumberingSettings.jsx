import { DashboardErrorState } from '../../../components/dashboard/DashboardStates';
import '../../../styles/Dashboard.css';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SettingsPageHeader } from '../../Settings/SettingsPageHeader';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  Alert,
  Button,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import {
  RestartAlt,
  SaveOutlined,
  DeleteOutline,
  HelpOutline,
} from '@mui/icons-material';
import {
  RESET_POLICIES,
  DEFAULT_NUMBERING_CONFIG,
  numberingValidationSchema,
} from '../validation/numberingValidation';
import { numberingService } from '../services/numberingService';
import { DocumentTypeSelector } from '../components/DocumentTypeSelector';
import { FormatBuilder } from '../components/FormatBuilder';
import { NextNumberPreviewCard } from '../components/NextNumberPreviewCard';
import '../styles/numbering-settings.css';

export function NumberingSettings() {
  const requestLock = useRef(false);
  const loadRevision = useRef(0);
  const savedSettings = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [toast, setToast] = useState('');
  const [toastSeverity, setToastSeverity] = useState('info');

  const {
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
  const currentNextNum = watch('nextNumber') ?? '';
  const currentResetPolicy = watch('resetPolicy') || 'Never (Continuous sequence)';

  // Load configuration for document type
  const loadSettingsForType = useCallback(async (docType) => {
    const revision = ++loadRevision.current;
    setIsLoading(true);
    setLoaded(false);
    setApiError('');
    setToast('');
    try {
      const data = await numberingService.getSettings(docType);
      if (revision !== loadRevision.current) return;
      const settings = { ...data,
        prefix: data.prefix.replace(/\{/g, '(').replace(/\}/g, ')'),
        suffix: data.suffix.replace(/\{/g, '(').replace(/\}/g, ')'),
        tokens: data.tokens.replace(/\{/g, '(').replace(/\}/g, ')'),
      };
      savedSettings.current = settings;
      reset(settings);
      setLoaded(true);
    } catch (err) {
      if (revision === loadRevision.current) setApiError(err.userMessage || err.message || 'Unable to load numbering settings. Please retry.');
    } finally {
      if (revision === loadRevision.current) setIsLoading(false);
    }
  }, [reset]);

  useEffect(() => {
    loadSettingsForType('Invoice');
    return () => { loadRevision.current += 1; };
  }, [loadSettingsForType]);

  // Handle switching document type
  const handleSelectDocType = (docType) => {
    if (requestLock.current) return;
    setValue('documentType', docType);
    loadSettingsForType(docType);
  };

  // Restore the last successful GET/PUT, including its sequence counter.
  const handleResetChanges = () => {
    if (!savedSettings.current || requestLock.current) return;
    reset(savedSettings.current);
    setApiError('');
    setToastSeverity('info');
    setToast(`Restored saved settings for ${currentDocType}.`);
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
    setToastSeverity('info');
    setToast('Cleared format tokens.');
  };

  // Save handler
  const onSave = async (isDraft = false) => {
    if (requestLock.current || isSubmitting || isLoading || !loaded) return;
    requestLock.current = true;
    setIsSubmitting(true);
    setToast('');
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
        const settings = {
          documentType: result.documentType || currentDocType,
          prefix: (result.prefix ?? currentPrefix).replace(/\{/g, '(').replace(/\}/g, ')'),
          suffix: (result.suffix ?? currentSuffix).replace(/\{/g, '(').replace(/\}/g, ')'),
          tokens: (result.tokens ?? currentTokens).replace(/\{/g, '(').replace(/\}/g, ')'),
          sequenceLength: Number(result.sequenceLength ?? currentSeqLength),
          nextNumber: Number(result.nextNumber ?? currentNextNum),
          resetPolicy: result.resetPolicy || currentResetPolicy,
        };
        savedSettings.current = settings;
        reset(settings);
      }
      setToastSeverity('success');
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
      <SettingsPageHeader
        title="Invoice Numbering"
        description="Define document formats, set sequence rules, and preview your next invoice number."
      />

      {/* Error Alert */}
      {apiError && (!loaded ? (
        <DashboardErrorState title="Unable to load numbering settings" message={apiError} onRetry={() => loadSettingsForType(currentDocType)} />
      ) : <Alert severity="error" sx={{ mb: 3 }}>{apiError}</Alert>)}

      {isLoading && <Alert severity="info" role="status">Loading numbering settings...</Alert>}
      {/* Main 2-Column Layout */}
      <div className="numbering-content-grid">
        {/* Left Column: Configuration Steps 1, 2, 3 */}
        <fieldset className="numbering-steps-column" disabled={isLoading || isSubmitting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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
    setToastSeverity('info');
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
                  <option value={9}>9 Digits (000000001)</option>
                  <option value={10}>10 Digits (0000000001)</option>
                </select>
                <span className="field-helper-text">Total digits for the sequence number</span>
                {errors.sequenceLength && <span className="field-error-text">{errors.sequenceLength.message}</span>}
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

            {errors.tokens && <span className="field-error-text">{errors.tokens.message}</span>}
            <FormatBuilder
              prefix={currentPrefix}
              suffix={currentSuffix}
              tokens={currentTokens}
              onAddToken={handleAddToken}
              onClearTokens={handleClearTokens}
            />
          </section>
        </fieldset>

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
            disabled={isSubmitting || isLoading || !loaded}
          >
            <RestartAlt style={{ fontSize: '1.1rem' }} />
            Reset Changes
          </button>
        </div>

        <div className="bottom-bar-right">
          <button
            type="button"
            className="bar-btn bar-btn-outline"
            onClick={handleSubmit(() => onSave(true))}
            disabled={isSubmitting || isLoading || !loaded}
          >
            <SaveOutlined style={{ fontSize: '1.1rem' }} />
            Save as Draft
          </button>

          <button
            type="button"
            className="bar-btn bar-btn-primary"
            onClick={handleSubmit(() => onSave(false))}
            disabled={isSubmitting || isLoading || !loaded}
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
        autoHideDuration={4000}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        onClose={(_event, reason) => { if (reason !== 'clickaway') setToast(''); }}
      >
        <Alert severity={toastSeverity} variant="filled" onClose={() => setToast('')} sx={{ width: '100%' }}>{toast}</Alert>
      </Snackbar>
    </div>
  );
}

export default NumberingSettings;
