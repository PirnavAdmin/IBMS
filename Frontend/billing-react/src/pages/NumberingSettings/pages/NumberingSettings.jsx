import React, { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  numberingValidationSchema,
  DEFAULT_NUMBERING_CONFIG,
  DEFAULT_PRESETS_BY_DOC_TYPE,
} from '../validation/numberingValidation';
import { numberingService } from '../services/numberingService';
import { NumberingSettingsForm } from '../components/NumberingSettingsForm';
import { NextNumberPreviewCard } from '../components/NextNumberPreviewCard';
import '../styles/numbering-settings.css';
import {
  FormatListNumberedOutlined,
  CheckCircleOutline,
  ErrorOutline,
  InfoOutlined,
  ChevronRight,
} from '@mui/icons-material';
import { Skeleton } from '@mui/material';

export function NumberingSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error' | 'info', message: string }

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
  const formValues = watch();

  // Load configuration for the selected document type
  const loadSettingsForType = useCallback(async (docType) => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const data = await numberingService.getSettings(docType);
      if (data) {
        reset({
          documentType: data.documentType || docType,
          prefix: data.prefix ?? '',
          suffix: data.suffix ?? '',
          tokens: data.tokens ?? '',
          sequenceLength: Number(data.sequenceLength ?? 4),
          nextNumber: Number(data.nextNumber ?? 1),
          resetPolicy: data.resetPolicy || 'Financial Year',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to load numbering settings.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  // Initial load
  useEffect(() => {
    loadSettingsForType(currentDocType);
  }, [loadSettingsForType]);

  // Handle switching document type
  const handleDocumentTypeChange = (newDocType) => {
    loadSettingsForType(newDocType);
  };

  // Reset to default preset for the currently active document type
  const handleResetDefaults = () => {
    const preset =
      DEFAULT_PRESETS_BY_DOC_TYPE[currentDocType] || DEFAULT_NUMBERING_CONFIG;
    reset({
      ...preset,
      documentType: currentDocType,
    });
    setFeedback({
      type: 'info',
      message: `Reset numbering rules for ${currentDocType} to standard defaults. Click 'Save Configuration' to persist.`,
    });
  };

  // Quick insert token into tokens field
  const handleInsertToken = (token) => {
    const existing = formValues.tokens || '';
    const nextVal = existing ? `${existing}${token}` : `${token}-`;
    setValue('tokens', nextVal, { shouldValidate: true, shouldDirty: true });
  };

  // Form submit handler
  const onSubmit = async (data) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const payload = {
        documentType: data.documentType,
        prefix: data.prefix.trim(),
        suffix: data.suffix.trim(),
        tokens: data.tokens.trim(),
        sequenceLength: parseInt(data.sequenceLength, 10),
        nextNumber: parseInt(data.nextNumber, 10),
        resetPolicy: data.resetPolicy,
      };

      const result = await numberingService.updateSettings(payload);
      reset(result);
      setFeedback({
        type: 'success',
        message: `Numbering settings for ${result.documentType} updated successfully.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.userMessage || err.message || 'Failed to update numbering settings.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="num-settings-page">
      {/* Breadcrumb */}
      <nav className="num-breadcrumb" aria-label="Breadcrumb">
        <span>Configuration & Administration</span>
        <ChevronRight style={{ fontSize: '0.9rem', opacity: 0.6 }} />
        <strong>Numbering Settings</strong>
      </nav>

      {/* Page Header */}
      <header className="num-header">
        <div className="num-header-copy">
          <h1>Numbering Settings</h1>
          <p>Configure document numbering format, dynamic date tokens, and sequence rules.</p>
        </div>

        <div className="num-header-badge">
          <FormatListNumberedOutlined style={{ fontSize: '1rem' }} />
          Active: {currentDocType}
        </div>
      </header>

      {/* Feedback Alert Banners */}
      {feedback && (
        <div
          className={`num-alert ${
            feedback.type === 'success'
              ? 'num-alert-success'
              : feedback.type === 'error'
              ? 'num-alert-error'
              : 'num-alert-info'
          }`}
          role="alert"
        >
          {feedback.type === 'success' && <CheckCircleOutline />}
          {feedback.type === 'error' && <ErrorOutline />}
          {feedback.type === 'info' && <InfoOutlined />}
          <div>{feedback.message}</div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="num-settings-layout">
          <div className="num-form-card" style={{ padding: '28px' }}>
            <Skeleton variant="text" width="40%" height={32} />
            <Skeleton variant="rectangular" height={56} style={{ margin: '18px 0', borderRadius: '8px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', margin: '20px 0' }}>
              <Skeleton variant="rectangular" height={56} style={{ borderRadius: '8px' }} />
              <Skeleton variant="rectangular" height={56} style={{ borderRadius: '8px' }} />
            </div>
            <Skeleton variant="text" width="50%" height={32} style={{ marginTop: '24px' }} />
            <Skeleton variant="rectangular" height={56} style={{ margin: '18px 0', borderRadius: '8px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', margin: '20px 0' }}>
              <Skeleton variant="rectangular" height={56} style={{ borderRadius: '8px' }} />
              <Skeleton variant="rectangular" height={56} style={{ borderRadius: '8px' }} />
            </div>
          </div>
          <div className="num-preview-card">
            <Skeleton variant="text" width="60%" height={28} />
            <Skeleton variant="rectangular" height={100} style={{ margin: '16px 0', borderRadius: '10px' }} />
            <Skeleton variant="rectangular" height={140} style={{ borderRadius: '8px' }} />
          </div>
        </div>
      ) : (
        /* Main 2-column layout */
        <div className="num-settings-layout">
          <main>
            <NumberingSettingsForm
              register={register}
              errors={errors}
              watch={watch}
              setValue={setValue}
              onSubmit={handleSubmit(onSubmit)}
              isSubmitting={isSubmitting}
              onResetDefaults={handleResetDefaults}
              onDocumentTypeChange={handleDocumentTypeChange}
            />
          </main>

          <NextNumberPreviewCard
            formValues={formValues}
            onInsertToken={handleInsertToken}
          />
        </div>
      )}
    </div>
  );
}

export default NumberingSettings;
