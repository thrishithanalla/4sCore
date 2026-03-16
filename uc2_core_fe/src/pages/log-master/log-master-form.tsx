/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { Toast } from 'mainFe/Toast';
import { LoadingSpinner } from 'mainFe/LoadingSpinner';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';

import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';

import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { logMasterService } from '../../services/log-master.service';
import { JOB_NAMES } from '../../constants/jobNames';

const extractApiError = (error: any): string | null => {
  const detail = error?.response?.data?.detail;
  if (detail && typeof detail === 'object') {
    return detail.message || detail.error?.errorCode || null;
  }
  const msg = error?.response?.data?.message ?? error?.response?.data?.error ?? error?.message;
  return msg ? String(msg) : null;
};

const extractPlaceholders = (template: string): string[] => {
  const regex = /\{(\w+)\}/g;
  const placeholders: string[] = [];
  let match;
  while ((match = regex.exec(template)) !== null) {
    if (!placeholders.includes(match[1])) placeholders.push(match[1]);
  }
  return placeholders;
};

const generateJsonFromPlaceholders = (placeholders: string[]): Record<string, string> => {
  const json: Record<string, string> = {};
  placeholders.forEach((key) => { json[key] = key; });
  return json;
};

const logMasterSchema = z.object({
  eventCode: z.string().min(1, 'Event Code is required').max(200, 'Must be <= 200 characters').trim(),
  logObject: z.string().min(1, 'Log Object is required').max(200).trim(),
  action: z.string().min(1, 'Action is required').max(100).trim(),
  keyFields: z.string().min(1, 'Key Fields is required').max(500).trim(),
  description: z.string().min(1, 'Description is required').max(1000).trim(),
  messageTemplate: z.string().min(1, 'Message Template is required').trim(),
  templateParameters: z.string().optional().or(z.literal('')),
  parameters: z.string().optional().or(z.literal('')),
  layer: z.string().min(1, 'Layer is required'),
  logLevel: z.string().min(1, 'Log Level is required'),
  logtype: z.string().min(1, 'Log Type is required'),
  retentionPeriod: z.string().min(1, 'Retention Period is required')
    .refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Must be a positive number'),
  isSensitive: z.boolean(),
  isUsageTrackable: z.boolean(),
});

export type LogMasterFormData = z.infer<typeof logMasterSchema>;

const layerOptions = [
  { label: 'API', value: 'API' },
  { label: 'Screen', value: 'screen' },
  { label: 'Server', value: 'Server' },
  { label: 'DB', value: 'db' },
  { label: 'Function', value: 'function' },
];

const logLevelOptions = [
  { label: 'INFO', value: 'INFO' },
  { label: 'WARNING', value: 'WARNING' },
  { label: 'ERROR', value: 'ERROR' },
];

const logTypeOptions = [
  { label: 'AUDIT', value: 'AUDIT' },
  { label: 'USAGE', value: 'USAGE' },
  { label: 'SECURITY', value: 'SECURITY' },
];

const LogMasterForm = () => {
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'log-master',
    basePath: '/log-master',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  const { data: existing, isLoading: fetchLoading } = useQuery({
    queryKey: ['log-master', id],
    queryFn: () => logMasterService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  useBreadcrumbTitle(isEditMode ? 'Edit Log Master' : 'Create Log Master');

  const {
    control, handleSubmit, reset, watch, setValue,
    formState: { errors, isDirty },
  } = useForm<LogMasterFormData>({
    resolver: zodResolver(logMasterSchema) as Resolver<LogMasterFormData>,
    defaultValues: {
      eventCode: '', logObject: '', action: '', keyFields: '',
      description: '', messageTemplate: '', templateParameters: '{}', parameters: '',
      layer: 'API', logLevel: 'INFO', logtype: 'AUDIT',
      retentionPeriod: '365', isSensitive: false, isUsageTrackable: false,
    },
    mode: 'onChange',
  });

  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });
  const handleCancel = () => handleNavigate('/log-master');

  const templateValue = watch('messageTemplate');
  const tpValue = watch('templateParameters');
  const parametersValue = watch('parameters');

  // Auto-generate templateParameters and parameters from messageTemplate placeholders
  useEffect(() => {
    if (templateValue) {
      const placeholders = extractPlaceholders(templateValue);
      if (placeholders.length > 0) {
        const generatedJson = generateJsonFromPlaceholders(placeholders);
        try {
          const currentJson = JSON.parse(tpValue || '{}');
          const currentKeys = Object.keys(currentJson);
          const isAutoGenerated = currentKeys.every((key) => currentJson[key] === key);
          if (currentKeys.length === 0 || isAutoGenerated) {
            setValue('templateParameters', JSON.stringify(generatedJson, null, 2));
          }
        } catch {
          setValue('templateParameters', JSON.stringify(generatedJson, null, 2));
        }

        // Auto-populate parameters if empty or matches previous auto-generated value
        const autoParams = placeholders.join(', ');
        const currentParams = parametersValue?.trim() || '';
        if (!currentParams || currentParams === autoParams || placeholders.every((p) => currentParams.split(',').map((s: string) => s.trim()).includes(p))) {
          setValue('parameters', autoParams);
        }
      }
    }
  }, [templateValue, setValue]);

  // Populate form in edit mode
  useEffect(() => {
    if (existing && isEditMode) {
      reset({
        eventCode: existing.eventCode || '',
        logObject: existing.logObject || '',
        action: existing.action || '',
        keyFields: existing.keyFields || '',
        description: existing.description || '',
        messageTemplate: existing.messageTemplate || '',
        templateParameters: existing.templateParameters ? JSON.stringify(existing.templateParameters, null, 2) : '{}',
        parameters: existing.parameters?.join(', ') || '',
        layer: existing.layer || 'API',
        logLevel: existing.logLevel || 'INFO',
        logtype: existing.logtype || 'AUDIT',
        retentionPeriod: existing.retentionPeriod?.toString() || '365',
        isSensitive: existing.isSensitive || false,
        isUsageTrackable: existing.isUsageTrackable || false,
      });
    }
  }, [existing, isEditMode, reset]);

  const createMut = useMutation({
    mutationFn: (payload: any) => logMasterService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['log-master'] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Log Master created successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to create Log Master', life: 10000 });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => logMasterService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['log-master'] });
      queryClient.invalidateQueries({ queryKey: ['log-master', id] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Log Master updated successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to update Log Master', life: 10000 });
    },
  });

  const isSaving = createMut.isPending || updateMut.isPending;

  const onSubmit = (data: LogMasterFormData) => {
    let parsedTP: Record<string, any> = {};
    try {
      parsedTP = JSON.parse(data.templateParameters || '{}');
    } catch {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Invalid JSON in Template Parameters', life: 10000 });
      return;
    }

    const payload: any = {
      eventCode: data.eventCode,
      logObject: data.logObject,
      action: data.action,
      keyFields: data.keyFields,
      description: data.description,
      messageTemplate: data.messageTemplate,
      templateParameters: Object.keys(parsedTP).length > 0 ? parsedTP : null,
      parameters: data.parameters
        ? data.parameters.split(',').map((p: string) => p.trim()).filter(Boolean)
        : Object.keys(parsedTP).length > 0 ? Object.keys(parsedTP) : null,
      layer: data.layer,
      logLevel: data.logLevel,
      logtype: data.logtype,
      retentionPeriod: Number(data.retentionPeriod),
      isSensitive: data.isSensitive,
      isUsageTrackable: data.isUsageTrackable,
    };

    if (isEditMode) {
      updateMut.mutate(payload);
    } else {
      createMut.mutate(payload);
    }
  };

  if (fetchLoading) {
    return (
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900 flex justify-center items-center min-h-[300px]">
        <LoadingSpinner size="50px" />
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.LOG_MASTER}>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900" data-testid={isEditMode ? 'SCR-LogMaster-Edit' : 'SCR-LogMaster-Create'}>
        <div className="mb-4 flex items-center gap-3">
          <button type="button" onClick={handleCancel} className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors">
            <i className="pi pi-arrow-left text-lg" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {isEditMode ? 'Edit Log Master' : 'Create Log Master'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isEditMode ? 'Update log master configuration' : 'Create a new audit log master entry'}
            </p>
          </div>
        </div>

        <form id="log-master-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Event Code */}
                <Controller name="eventCode" control={control} render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Event Code <span className="text-red-500">*</span></label>
                    <InputText value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} placeholder="e.g. LOG.CORE.PERSONNEL.CREATED" className={`w-full ${errors.eventCode ? 'p-invalid' : ''}`} disabled={isEditMode} />
                    {errors.eventCode && <small className="text-red-500">{errors.eventCode.message}</small>}
                  </div>
                )} />

                {/* Log Object */}
                <Controller name="logObject" control={control} render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Log Object <span className="text-red-500">*</span></label>
                    <InputText value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} placeholder="e.g. PERSONNEL" className={`w-full ${errors.logObject ? 'p-invalid' : ''}`} />
                    {errors.logObject && <small className="text-red-500">{errors.logObject.message}</small>}
                  </div>
                )} />

                {/* Action */}
                <Controller name="action" control={control} render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Action <span className="text-red-500">*</span></label>
                    <InputText value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} placeholder="e.g. CREATED" className={`w-full ${errors.action ? 'p-invalid' : ''}`} />
                    {errors.action && <small className="text-red-500">{errors.action.message}</small>}
                  </div>
                )} />

                {/* Layer */}
                <Controller name="layer" control={control} render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Layer <span className="text-red-500">*</span></label>
                    <Dropdown value={field.value} options={layerOptions} onChange={(e) => field.onChange(e.value)} placeholder="Select layer" className={`w-full ${errors.layer ? 'p-invalid' : ''}`} />
                    {errors.layer && <small className="text-red-500">{errors.layer.message}</small>}
                  </div>
                )} />

                {/* Key Fields */}
                <Controller name="keyFields" control={control} render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Key Fields <span className="text-red-500">*</span></label>
                    <InputText value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} placeholder="e.g. personnelId" className={`w-full ${errors.keyFields ? 'p-invalid' : ''}`} />
                    {errors.keyFields && <small className="text-red-500">{errors.keyFields.message}</small>}
                  </div>
                )} />

                {/* Log Level */}
                <Controller name="logLevel" control={control} render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Log Level <span className="text-red-500">*</span></label>
                    <Dropdown value={field.value} options={logLevelOptions} onChange={(e) => field.onChange(e.value)} placeholder="Select level" className={`w-full ${errors.logLevel ? 'p-invalid' : ''}`} />
                    {errors.logLevel && <small className="text-red-500">{errors.logLevel.message}</small>}
                  </div>
                )} />

                {/* Log Type */}
                <Controller name="logtype" control={control} render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Log Type <span className="text-red-500">*</span></label>
                    <Dropdown value={field.value} options={logTypeOptions} onChange={(e) => field.onChange(e.value)} placeholder="Select type" className={`w-full ${errors.logtype ? 'p-invalid' : ''}`} />
                    {errors.logtype && <small className="text-red-500">{errors.logtype.message}</small>}
                  </div>
                )} />

                {/* Retention Period */}
                <Controller name="retentionPeriod" control={control} render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Retention (days) <span className="text-red-500">*</span></label>
                    <InputNumber value={field.value ? Number(field.value) : null} onValueChange={(e) => field.onChange(e.value?.toString() || '')} placeholder="365" className={`w-full ${errors.retentionPeriod ? 'p-invalid' : ''}`} min={1} useGrouping={false} />
                    {errors.retentionPeriod && <small className="text-red-500">{errors.retentionPeriod.message}</small>}
                  </div>
                )} />

                {/* Description */}
                <div className="md:col-span-3">
                  <Controller name="description" control={control} render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Description <span className="text-red-500">*</span></label>
                      <InputTextarea value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} placeholder="Enter the description/purpose of this log" rows={2} className={`w-full ${errors.description ? 'p-invalid' : ''}`} />
                      {errors.description && <small className="text-red-500">{errors.description.message}</small>}
                    </div>
                  )} />
                </div>

                {/* Message Template */}
                <div className="md:col-span-3">
                  <Controller name="messageTemplate" control={control} render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Message Template <span className="text-red-500">*</span></label>
                      <InputTextarea value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} placeholder="e.g. Personnel '{name}' (ID: {personnelId}) was created by {createdByName}" rows={3} className={`w-full ${errors.messageTemplate ? 'p-invalid' : ''}`} />
                      {errors.messageTemplate ? (
                        <small className="text-red-500">{errors.messageTemplate.message}</small>
                      ) : (
                        <small className="text-gray-500">Use {'{placeholder}'} syntax. Template Parameters will be auto-generated.</small>
                      )}
                    </div>
                  )} />
                </div>

                {/* Template Parameters (JSON) */}
                <div className="md:col-span-3">
                  <Controller name="templateParameters" control={control} render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Template Parameters</label>
                      <InputTextarea value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} placeholder='{"name": "name"}' rows={6} className="w-full font-mono text-sm" />
                      <small className="text-gray-500">Auto-generated from template placeholders. You can edit manually.</small>
                    </div>
                  )} />
                </div>

                {/* Parameters */}
                <div className="md:col-span-3">
                  <Controller name="parameters" control={control} render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Parameters</label>
                      <InputText value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} placeholder="e.g. userId, cameraId, unitId" className="w-full font-mono text-sm" />
                      <small className="text-gray-500">Auto-generated from template placeholders. Comma-separated. You can edit manually.</small>
                    </div>
                  )} />
                </div>

                {/* Checkboxes */}
                <div className="flex gap-6 items-center">
                  <Controller name="isSensitive" control={control} render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox inputId="isSensitive" checked={field.value} onChange={(e) => field.onChange(e.checked)} />
                      <label htmlFor="isSensitive" className="text-sm text-gray-700 dark:text-gray-300">Sensitive</label>
                    </div>
                  )} />
                  <Controller name="isUsageTrackable" control={control} render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox inputId="isUsageTrackable" checked={field.value} onChange={(e) => field.onChange(e.checked)} />
                      <label htmlFor="isUsageTrackable" className="text-sm text-gray-700 dark:text-gray-300">Usage Trackable</label>
                    </div>
                  )} />
                </div>
              </div>
            </div>

            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 rounded-b-lg">
              <Button type="button" label="Cancel" severity="secondary" outlined onClick={handleCancel} disabled={isSaving} />
              <Button type="button" label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'} icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'} disabled={isSaving} onClick={handleSubmit(onSubmit)} />
            </div>
          </div>
        </form>

        <DiscardChangesDialog visible={showLeaveDialog} onStay={cancelLeave} onLeave={confirmLeave} testId="LogMasterForm.Dialog.Leave" />
      </div>
    </PermissionGuard>
  );
};

export default LogMasterForm;
