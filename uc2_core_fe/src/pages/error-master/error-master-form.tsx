/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { z } from 'zod';

import { Toast } from 'mainFe/Toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { Checkbox } from 'primereact/checkbox';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';

import FormInput from '../../components/forms/form-input';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import FormSelect from '../../components/forms/form-select';
import { errorMasterService } from '../../services/error-master.service';
import { valueSetsService } from '../../services/value-sets.service';
import { extractErrorMessage } from '../../utils/error-handler';

// Zod Validation Schema
const localizedMessageSchema = z.object({
  language: z
    .string()
    .min(2, 'Language code must be at least 2 characters')
    .max(2, 'Language code must be 2 characters (ISO-639-1)')
    .regex(/^[a-z]{2}$/, 'Language code must be lowercase ISO-639-1 (e.g., en, hi, te)'),
  template: z
    .string()
    .min(1, 'Template is required')
    .max(2000, 'Template must not exceed 2000 characters'),
});

const errorMasterSchema = z.object({
  errorCode: z
    .string()
    .min(3, 'Error code must be at least 3 characters')
    .max(120, 'Error code must not exceed 120 characters')
    .regex(
      /^ERR\.[A-Z0-9_]+\.[A-Z0-9_]+\.[A-Z0-9_]+/,
      'Error code should follow format: ERR.<MODULE>.<COMPONENT>.<ACTION>'
    )
    .trim(),
  errorType: z.string().min(1, 'Error type is required'),
  errorSeverity: z.string().min(1, 'Error severity is required'),
  sourceType: z.string().min(1, 'Source type is required'),
  sourceName: z.string().min(1, 'Source name is required').max(120),
  appCode: z.string().min(1, 'App code is required').max(120),
  isActive: z.boolean(),
  log: z.boolean(),
  businessArea: z.string().max(120).optional().or(z.literal('')),
  technicalArea: z.string().max(120).optional().or(z.literal('')),
  tool: z.string().max(120).optional().or(z.literal('')),
  partnerSystem: z.string().max(120).optional().or(z.literal('')),
  thirdParty: z.string().max(120).optional().or(z.literal('')),
  notificationId: z.string().optional().or(z.literal('')),
  messages: z
    .array(localizedMessageSchema)
    .min(1, 'At least one localized message is required'),
  devMessage: z.string().max(2000).optional().or(z.literal('')),
  helpLink: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  videoLink: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

type ErrorMasterFormData = z.infer<typeof errorMasterSchema>;

const ErrorMasterForm = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'errorMaster',
    basePath: '/error-master',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  const DRAFT_KEY = `error-master-draft-${isEditMode ? id : 'new'}`;

  // Draft state
  const [draftData, setDraftData] = useState<ErrorMasterFormData | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  // React Hook Form
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
    setValue,
  } = useForm<ErrorMasterFormData>({
    resolver: zodResolver(errorMasterSchema),
    defaultValues: {
      errorCode: '',
      errorType: '',
      errorSeverity: '',
      sourceType: '',
      sourceName: '',
      appCode: '',
      isActive: true,
      log: true,
      businessArea: '',
      technicalArea: '',
      tool: '',
      partnerSystem: '',
      thirdParty: '',
      notificationId: '',
      messages: [{ language: 'en', template: '' }],
      devMessage: '',
      helpLink: '',
      videoLink: '',
    },
    mode: 'onChange',
  });

  const formValues = watch();

  // Navigation blocker for unsaved changes
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Field array for messages
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'messages',
  });

  // Fetch value-sets for dropdowns
  const { data: errorTypeItems = [] } = useQuery({
    queryKey: ['value-sets', 'errorType'],
    queryFn: () => valueSetsService.getItems('errorType', 'en'),
  });

  const { data: errorSeverityItems = [] } = useQuery({
    queryKey: ['value-sets', 'errorSeverity'],
    queryFn: () => valueSetsService.getItems('errorSeverity', 'en'),
  });

  const { data: sourceTypeItems = [] } = useQuery({
    queryKey: ['value-sets', 'sourceType'],
    queryFn: () => valueSetsService.getItems('sourceType', 'en'),
  });

  // Fetch error master data for edit mode
  const { data: errorMaster, isLoading: fetchLoading } = useQuery({
    queryKey: ['error-master', id],
    queryFn: () => errorMasterService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title
  useBreadcrumbTitle(isEditMode ? errorMaster?.errorCode : null);

  // Helper function to match backend format to value-set code
  const matchValueSetCode = useCallback((backendValue: string | undefined, valueSetItems: any[]) => {
    if (!backendValue) return '';
    const exactMatch = valueSetItems.find(item => item.code === backendValue);
    if (exactMatch) return backendValue;
    const caseInsensitiveMatch = valueSetItems.find(
      item => item.code.toLowerCase() === backendValue.toLowerCase()
    );
    return caseInsensitiveMatch ? caseInsensitiveMatch.code : backendValue;
  }, []);

  // Populate form when error master data is loaded
  useEffect(() => {
    if (errorMaster && isEditMode && errorTypeItems.length > 0 && errorSeverityItems.length > 0) {
      reset({
        errorCode: errorMaster.errorCode || '',
        errorType: matchValueSetCode((errorMaster as any).errorType, errorTypeItems),
        errorSeverity: matchValueSetCode(errorMaster.errorSeverity, errorSeverityItems),
        sourceType: matchValueSetCode((errorMaster as any).sourceType, sourceTypeItems),
        sourceName: (errorMaster as any).sourceName || '',
        appCode: (errorMaster as any).appCode || '',
        isActive: errorMaster.isActive ?? true,
        log: errorMaster.log ?? true,
        businessArea: errorMaster.businessArea || '',
        technicalArea: errorMaster.technicalArea || '',
        tool: errorMaster.tool || '',
        partnerSystem: errorMaster.partnerSystem || '',
        thirdParty: errorMaster.thirdParty || '',
        notificationId: (errorMaster as any).notificationId || '',
        messages: errorMaster.messages || [{ language: 'en', template: '' }],
        devMessage: errorMaster.devMessage || '',
        helpLink: errorMaster.helpLink || '',
        videoLink: errorMaster.videoLink || '',
      });
    }
  }, [errorMaster, isEditMode, reset, errorTypeItems, errorSeverityItems, sourceTypeItems, matchValueSetCode]);

  // Draft autosave (only for create mode)
  useEffect(() => {
    if (isEditMode || !isDirty) return;
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(formValues));
    }, 1500);
    return () => clearTimeout(timer);
  }, [formValues, isDirty, isEditMode, DRAFT_KEY]);

  // Load draft on mount (only for create mode)
  useEffect(() => {
    if (!isEditMode) {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          setDraftData(parsed);
          setShowDraftBanner(true);
        } catch (error) {
          console.error('Failed to parse draft:', error);
        }
      }
    }
  }, [isEditMode, DRAFT_KEY]);

  // Mutation for create/update
  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (isEditMode && id) {
        return errorMasterService.update(id, data);
      }
      return errorMasterService.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['error-master'] });
      localStorage.removeItem(DRAFT_KEY);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Error master ${isEditMode ? 'updated' : 'created'} successfully`,
        life: 3000,
      });
      setTimeout(() => { navigateToList(); }, 1000);
    },
    onError: (error: any) => {
      console.error('Error response:', error.response);
      const errorMessage = extractErrorMessage(error, `Failed to ${isEditMode ? 'update' : 'create'} error master`);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: errorMessage, life: 10000 });
    },
  });

  const isSaving = mutation.isPending;

  const onSubmit = (data: ErrorMasterFormData) => {
    const payload: any = {
      ...data,
      isActive: data.isActive ?? true,
      log: data.isActive ? (data.log ?? true) : false,
      businessArea: data.businessArea || undefined,
      technicalArea: data.technicalArea || undefined,
      tool: data.tool || undefined,
      partnerSystem: data.partnerSystem || undefined,
      thirdParty: data.thirdParty || undefined,
      notificationId: data.notificationId || undefined,
      devMessage: data.devMessage || undefined,
      helpLink: data.helpLink || undefined,
      videoLink: data.videoLink || undefined,
    };

    // In edit mode, remove errorCode (immutable)
    if (isEditMode) {
      delete payload.errorCode;
    }

    mutation.mutate(payload);
  };

  const handleRestoreDraft = () => {
    if (draftData) { reset(draftData); setShowDraftBanner(false); }
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftData(null);
    setShowDraftBanner(false);
  };

  // Dropdown options
  const errorTypeOptions = useMemo(
    () => errorTypeItems.map((item) => ({ value: item.code, label: item.label })),
    [errorTypeItems]
  );

  const errorSeverityOptions = useMemo(
    () => errorSeverityItems.map((item) => ({ value: item.code, label: item.label })),
    [errorSeverityItems]
  );

  const sourceTypeDropdownOptions = useMemo(
    () => sourceTypeItems.map((item) => ({ value: item.code, label: item.label })),
    [sourceTypeItems]
  );

  if (fetchLoading) {
    return (
      <div className="p-3">
        <div className="flex justify-center items-center min-h-[300px]">
          <ProgressSpinner style={{ width: '40px', height: '40px' }} />
        </div>
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900 min-h-screen" data-testid="SCR-ErrorMaster-Form">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <button type="button" onClick={() => handleNavigate('/error-master')} className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors">
            <i className="pi pi-arrow-left text-lg" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {isEditMode ? 'Edit Error Master' : 'Create New Error Master'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isEditMode ? 'Update error master information' : 'Add a new error definition to the system'}
            </p>
          </div>
        </div>

        {/* Draft Recovery Banner */}
        {showDraftBanner && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 rounded mb-3">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <i className="pi pi-exclamation-circle text-blue-600 dark:text-blue-400" style={{ fontSize: '1rem' }} />
                <span className="text-sm text-blue-800 dark:text-blue-200">You have unsaved changes from a previous session. Would you like to restore them?</span>
              </div>
              <div className="flex gap-2">
                <Button label="Restore" size="small" severity="info" onClick={handleRestoreDraft} />
                <Button label="Discard" size="small" severity="secondary" outlined onClick={handleDiscardDraft} />
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Basic Information Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded p-3 mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Controller
                  name="errorCode"
                  control={control}
                  render={({ field }) => (
                    <FormInput {...field} label="Error Code" placeholder="ERR.MODULE.COMPONENT.ACTION" error={!!errors.errorCode} helperText={errors.errorCode?.message || 'Format: ERR.<MODULE>.<COMPONENT>.<ACTION>'} required disabled={isEditMode} />
                  )}
                />
              </div>

              <Controller
                name="errorType"
                control={control}
                render={({ field: { value, onChange, ...field } }) => (
                  <FormSelect {...field} value={value || ''} onChange={(e) => onChange(e.target.value)} label="Error Type" options={errorTypeOptions} error={!!errors.errorType} helperText={errors.errorType?.message} required />
                )}
              />

              <Controller
                name="errorSeverity"
                control={control}
                render={({ field: { value, onChange, ...field } }) => (
                  <FormSelect {...field} value={value || ''} onChange={(e) => onChange(e.target.value)} label="Error Severity" options={errorSeverityOptions} error={!!errors.errorSeverity} helperText={errors.errorSeverity?.message} required />
                )}
              />

              <Controller
                name="sourceType"
                control={control}
                render={({ field: { value, onChange, ...field } }) => (
                  <FormSelect {...field} value={value || ''} onChange={(e) => onChange(e.target.value)} label="Source Type" options={sourceTypeDropdownOptions} error={!!errors.sourceType} helperText={errors.sourceType?.message} required />
                )}
              />

              <Controller
                name="sourceName"
                control={control}
                render={({ field }) => (
                  <FormInput {...field} value={field.value || ''} label="Source Name" placeholder="e.g., core-service, auth-module" error={!!errors.sourceName} helperText={errors.sourceName?.message} required />
                )}
              />

              <Controller
                name="appCode"
                control={control}
                render={({ field }) => (
                  <FormInput {...field} value={field.value || ''} label="App Code" placeholder="e.g., CORE, AUTH, HR" error={!!errors.appCode} helperText={errors.appCode?.message} required />
                )}
              />

              <div className="flex items-center gap-4">
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field: { value, onChange } }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox inputId="isActive" checked={value} onChange={(e) => {
                        const active = e.checked ?? false;
                        onChange(active);
                        if (!active) setValue('log', false);
                      }} />
                      <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300">Active</label>
                    </div>
                  )}
                />
                <Controller
                  name="log"
                  control={control}
                  render={({ field: { value, onChange } }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox inputId="log" checked={value} onChange={(e) => onChange(e.checked)} disabled={!watch('isActive')} />
                      <label htmlFor="log" className={`text-sm ${watch('isActive') ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'}`}>Enable Logging</label>
                    </div>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Context Information Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded p-3 mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Context Information (Optional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Controller name="businessArea" control={control} render={({ field }) => (<FormInput {...field} value={field.value || ''} label="Business Area" placeholder="e.g., Authentication, Personnel Management" error={!!errors.businessArea} helperText={errors.businessArea?.message} />)} />
              <Controller name="technicalArea" control={control} render={({ field }) => (<FormInput {...field} value={field.value || ''} label="Technical Area" placeholder="e.g., Database, API, Frontend" error={!!errors.technicalArea} helperText={errors.technicalArea?.message} />)} />
              <Controller name="tool" control={control} render={({ field }) => (<FormInput {...field} value={field.value || ''} label="Tool" placeholder="e.g., MongoDB, Redis, JWT" error={!!errors.tool} helperText={errors.tool?.message} />)} />
              <Controller name="partnerSystem" control={control} render={({ field }) => (<FormInput {...field} value={field.value || ''} label="Partner System" placeholder="e.g., PaymentGateway, SMS Provider" error={!!errors.partnerSystem} helperText={errors.partnerSystem?.message} />)} />
              <Controller name="thirdParty" control={control} render={({ field }) => (<FormInput {...field} value={field.value || ''} label="Third Party" placeholder="e.g., Azure, AWS, Twilio" error={!!errors.thirdParty} helperText={errors.thirdParty?.message} />)} />
              <Controller name="notificationId" control={control} render={({ field }) => (<FormInput {...field} value={field.value || ''} label="Notification ID" placeholder="Notification master reference ID" error={!!errors.notificationId} helperText={errors.notificationId?.message} />)} />
            </div>
          </div>

          {/* Localized Messages Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded p-3 mb-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Localized Messages</h3>
              <Button type="button" label="Add Language" icon="pi pi-plus" size="small" outlined onClick={() => append({ language: '', template: '' })} />
            </div>

            {fields.map((field, index) => (
              <div key={field.id} className="p-3 mb-3 bg-gray-50 dark:bg-gray-700/50 rounded">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Message #{index + 1}</span>
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(index)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                      <i className="pi pi-trash" style={{ fontSize: '1rem' }} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Controller name={`messages.${index}.language`} control={control} render={({ field }) => (<FormInput {...field} label="Language Code" placeholder="en, hi, te" error={!!errors.messages?.[index]?.language} helperText={errors.messages?.[index]?.language?.message || 'ISO-639-1 (2 letters)'} required />)} />
                  <div className="md:col-span-3">
                    <Controller name={`messages.${index}.template`} control={control} render={({ field }) => (<FormInput {...field} label="Message Template" placeholder="Use {placeholderName} for dynamic values" error={!!errors.messages?.[index]?.template} helperText={errors.messages?.[index]?.template?.message || 'Use {lowerCamelCase} placeholders for dynamic content'} multiline rows={2} required />)} />
                  </div>
                </div>
              </div>
            ))}

            {errors.messages && typeof errors.messages === 'object' && !Array.isArray(errors.messages) && (
              <Message severity="error" text={(errors.messages as any).message} className="w-full mt-2" />
            )}
          </div>

          {/* Additional Information Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded p-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Additional Information (Optional)</h3>
            <div className="space-y-3">
              <Controller name="devMessage" control={control} render={({ field }) => (<FormInput {...field} value={field.value || ''} label="Developer Message" placeholder="Technical details for developers..." error={!!errors.devMessage} helperText={errors.devMessage?.message} multiline rows={3} />)} />
              <Controller name="helpLink" control={control} render={({ field }) => (<FormInput {...field} value={field.value || ''} label="Help Link" placeholder="https://docs.example.com/errors/..." error={!!errors.helpLink} helperText={errors.helpLink?.message} />)} />
              <Controller name="videoLink" control={control} render={({ field }) => (<FormInput {...field} value={field.value || ''} label="Video Link" placeholder="https://www.youtube.com/watch?v=..." error={!!errors.videoLink} helperText={errors.videoLink?.message} />)} />
            </div>
          </div>

          {/* Form Actions */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 flex justify-end gap-2 rounded-lg mt-3">
            <Button label="Cancel" severity="secondary" outlined onClick={() => handleNavigate('/error-master')} disabled={isSaving} size="small" />
            <Button type="submit" label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'} icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'} disabled={isSaving} size="small" testId="ErrorMasterForm.Button.Submit" />
          </div>
        </form>

        {/* Leave Confirmation Dialog */}
        <DiscardChangesDialog visible={showLeaveDialog} onStay={cancelLeave} onLeave={confirmLeave} testId="ErrorMasterForm.Dialog.Leave" />
      </div>
    </>
  );
};

export default ErrorMasterForm;
