/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { Controller, useForm, useFieldArray, type Resolver } from 'react-hook-form';
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
import type { ParameterDatatypeEnum } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DATATYPE_OPTIONS: { label: string; value: ParameterDatatypeEnum }[] = [
  { label: 'String', value: 'string' },
  { label: 'Number', value: 'number' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Date', value: 'date' },
  { label: 'Datetime', value: 'datetime' },
  { label: 'Array', value: 'array' },
  { label: 'Object', value: 'object' },
];

const LAYER_OPTIONS = [
  { label: 'API', value: 'API' },
  { label: 'Screen', value: 'screen' },
  { label: 'Server', value: 'Server' },
  { label: 'DB', value: 'db' },
  { label: 'Function', value: 'function' },
];

const LOG_LEVEL_OPTIONS = [
  { label: 'INFO', value: 'INFO' },
  { label: 'WARNING', value: 'WARNING' },
  { label: 'ERROR', value: 'ERROR' },
];

const LOG_TYPE_OPTIONS = [
  { label: 'AUDIT', value: 'AUDIT' },
  { label: 'USAGE', value: 'USAGE' },
  { label: 'SECURITY', value: 'SECURITY' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const parameterObjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).trim(),
  label: z.string().min(1, 'Label is required').max(200).trim(),
  datatype: z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'array', 'object'] as const, {
    message: 'Datatype is required',
  }),
  isKeyField: z.boolean().default(false),
  isSensitive: z.boolean().default(false),
});

const logMasterSchema = z.object({
  // auto-generated — read-only in UI
  eventCode: z.string().min(1, 'Event Code is required').max(200).trim(),
  logObject: z.string().min(1, 'Log Object is required').max(200).trim(),
  action: z.string().min(1, 'Action is required').max(100).trim(),
  description: z.string().min(1, 'Description is required').max(1000).trim(),
  messageTemplate: z.string().min(1, 'Message Template is required').trim(),
  templateParameters: z.string().optional().or(z.literal('')),
  layer: z.string().min(1, 'Layer is required'),
  logLevel: z.string().min(1, 'Log Level is required'),
  logtype: z.string().min(1, 'Log Type is required'),
  retentionPeriod: z.string().min(1, 'Retention Period is required')
    .refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Must be a positive number'),
  isUsageTrackable: z.boolean(),
  isActive: z.boolean(),
  canBeLogged: z.boolean(),
  parameters: z.array(parameterObjectSchema)
    .min(1, 'At least one parameter is required')
    .refine((params) => params.some((p) => p.isKeyField), 'At least one parameter must be marked as a Key Field'),
});

export type LogMasterFormData = z.infer<typeof logMasterSchema>;

// ─── Default empty parameter row ────────────────────────────────────────────

const DEFAULT_PARAMETER = {
  name: '',
  label: '',
  datatype: 'string' as ParameterDatatypeEnum,
  isKeyField: false,
  isSensitive: false,
};

// ─── Component ────────────────────────────────────────────────────────────────

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
      eventCode: '',
      logObject: '',
      action: '',
      description: '',
      messageTemplate: '',
      templateParameters: '{}',
      layer: 'API',
      logLevel: 'INFO',
      logtype: 'AUDIT',
      retentionPeriod: '365',
      isUsageTrackable: false,
      isActive: true,
      canBeLogged: true,
      parameters: [{ ...DEFAULT_PARAMETER }],
    },
    mode: 'onChange',
  });

  // Dynamic parameter array controller
  const { fields, append, remove } = useFieldArray({ control, name: 'parameters' });

  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });
  const handleCancel = () => handleNavigate('/log-master');

  const logObjectValue = watch('logObject');
  const actionValue = watch('action');
  const templateValue = watch('messageTemplate');
  const tpValue = watch('templateParameters');

  // Auto-generate eventCode from logObject+action
  useEffect(() => {
    if (logObjectValue && actionValue) {
      const generated = `${logObjectValue.trim().toUpperCase()}.${actionValue.trim().toUpperCase()}`;
      setValue('eventCode', generated, { shouldDirty: false });
    }
  }, [logObjectValue, actionValue, setValue]);

  // Auto-generate templateParameters from messageTemplate placeholders
  useEffect(() => {
    if (templateValue) {
      const placeholders = extractPlaceholders(templateValue);
      if (placeholders.length > 0) {
        const generatedJson: Record<string, string> = {};
        placeholders.forEach((key) => { generatedJson[key] = key; });
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
        description: existing.description || '',
        messageTemplate: existing.messageTemplate || '',
        templateParameters: existing.templateParameters
          ? JSON.stringify(existing.templateParameters, null, 2)
          : '{}',
        layer: existing.layer || 'API',
        logLevel: existing.logLevel || 'INFO',
        logtype: existing.logtype || 'AUDIT',
        retentionPeriod: existing.retentionPeriod?.toString() || '365',
        isUsageTrackable: existing.isUsageTrackable || false,
        isActive: existing.isActive ?? true,
        canBeLogged: existing.canBeLogged ?? true,
        parameters: existing.parameters?.length
          ? existing.parameters.map((p: any) => ({
            name: p.name,
            label: p.label,
            datatype: p.datatype,
            isKeyField: p.isKeyField,
            isSensitive: p.isSensitive,
          }))
          : [{ ...DEFAULT_PARAMETER }],
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
      description: data.description,
      messageTemplate: data.messageTemplate,
      templateParameters: Object.keys(parsedTP).length > 0 ? parsedTP : null,
      layer: data.layer,
      logLevel: data.logLevel,
      logtype: data.logtype,
      retentionPeriod: Number(data.retentionPeriod),
      isUsageTrackable: data.isUsageTrackable,
      isActive: data.isActive,
      canBeLogged: data.canBeLogged,
      parameters: data.parameters,
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
        <LoadingSpinner />
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

                {/* Event Code — read-only, auto-generated */}
                <Controller name="eventCode" control={control} render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Event Code
                      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">(auto-generated)</span>
                    </label>
                    <InputText
                      value={field.value || ''}
                      readOnly
                      disabled
                      placeholder="Auto-filled from Log Object + Action"
                      className="w-full bg-gray-100 dark:bg-gray-700 cursor-not-allowed"
                    />
                  </div>
                )} />

                {/* Layer */}
                <Controller name="layer" control={control} render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Layer <span className="text-red-500">*</span></label>
                    <Dropdown value={field.value} options={LAYER_OPTIONS} onChange={(e) => field.onChange(e.value)} placeholder="Select layer" className={`w-full ${errors.layer ? 'p-invalid' : ''}`} />
                    {errors.layer && <small className="text-red-500">{errors.layer.message}</small>}
                  </div>
                )} />

                {/* Log Level */}
                <Controller name="logLevel" control={control} render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Log Level <span className="text-red-500">*</span></label>
                    <Dropdown value={field.value} options={LOG_LEVEL_OPTIONS} onChange={(e) => field.onChange(e.value)} placeholder="Select level" className={`w-full ${errors.logLevel ? 'p-invalid' : ''}`} />
                    {errors.logLevel && <small className="text-red-500">{errors.logLevel.message}</small>}
                  </div>
                )} />

                {/* Log Type */}
                <Controller name="logtype" control={control} render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Log Type <span className="text-red-500">*</span></label>
                    <Dropdown value={field.value} options={LOG_TYPE_OPTIONS} onChange={(e) => field.onChange(e.value)} placeholder="Select type" className={`w-full ${errors.logtype ? 'p-invalid' : ''}`} />
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

                {/* Usage Trackable */}
                <div className="flex items-center gap-2 pt-6">
                  <Controller name="isUsageTrackable" control={control} render={({ field }) => (
                    <>
                      <Checkbox inputId="isUsageTrackable" checked={!!field.value} onChange={(e) => field.onChange(e.checked)} />
                      <label htmlFor="isUsageTrackable" className="text-sm text-gray-700 dark:text-gray-300">Usage Trackable</label>
                    </>
                  )} />
                </div>

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
                      <InputTextarea value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} placeholder='{"name": "name"}' rows={4} className="w-full font-mono text-sm" />
                      <small className="text-gray-500">Auto-generated from template placeholders. You can edit manually.</small>
                    </div>
                  )} />
                </div>
              </div>

              {/* ── Parameters Section ────────────────────────────────── */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      Parameters <span className="text-red-500">*</span>
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Fields captured in the audit log. Mark key fields and sensitive data accordingly.
                    </p>
                  </div>
                  <Button
                    type="button"
                    label="Add Parameter"
                    icon="pi pi-plus"
                    severity="secondary"
                    outlined
                    size="small"
                    onClick={() => append({ ...DEFAULT_PARAMETER })}
                  />
                </div>

                {/* Checkboxes from HEAD */}
                <div className="flex flex-wrap gap-6 items-center md:col-span-3">
                  <Controller name="isActive" control={control} render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox inputId="isActive" checked={!!field.value} onChange={(e) => field.onChange(e.checked)} />
                      <label htmlFor="isActive" className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</label>
                    </div>
                  )} />
                  <Controller name="canBeLogged" control={control} render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox inputId="canBeLogged" checked={!!field.value} onChange={(e) => field.onChange(e.checked)} />
                      <label htmlFor="canBeLogged" className="text-sm font-medium text-gray-700 dark:text-gray-300">Can Be Logged</label>
                    </div>
                  )} />
                </div>
                {errors.parameters && typeof errors.parameters === 'object' && 'message' in errors.parameters && (
                  <small className="text-red-500 block mb-2">{(errors.parameters as any).message}</small>
                )}

                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                    <div className="col-span-3">Name <span className="text-red-500">*</span></div>
                    <div className="col-span-3">Label <span className="text-red-500">*</span></div>
                    <div className="col-span-2">Datatype <span className="text-red-500">*</span></div>
                    <div className="col-span-2 text-center">Key Field</div>
                    <div className="col-span-1 text-center">Sensitive</div>
                    <div className="col-span-1 text-center">Remove</div>
                  </div>

                  {/* Parameter rows */}
                  {fields.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                      No parameters added. Click <strong>Add Parameter</strong> to begin.
                    </div>
                  ) : (
                    fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-gray-200 dark:border-gray-700 items-center"
                      >
                        {/* Name */}
                        <div className="col-span-3">
                          <Controller
                            name={`parameters.${index}.name`}
                            control={control}
                            render={({ field: f }) => (
                              <InputText
                                value={f.value || ''}
                                onChange={(e) => f.onChange(e.target.value)}
                                placeholder="e.g. personnelId"
                                className={`w-full text-sm ${errors.parameters?.[index]?.name ? 'p-invalid' : ''}`}
                              />
                            )}
                          />
                          {errors.parameters?.[index]?.name && (
                            <small className="text-red-500 text-xs">{errors.parameters[index]?.name?.message}</small>
                          )}
                        </div>

                        {/* Label */}
                        <div className="col-span-3">
                          <Controller
                            name={`parameters.${index}.label`}
                            control={control}
                            render={({ field: f }) => (
                              <InputText
                                value={f.value || ''}
                                onChange={(e) => f.onChange(e.target.value)}
                                placeholder="e.g. Personnel ID"
                                className={`w-full text-sm ${errors.parameters?.[index]?.label ? 'p-invalid' : ''}`}
                              />
                            )}
                          />
                          {errors.parameters?.[index]?.label && (
                            <small className="text-red-500 text-xs">{errors.parameters[index]?.label?.message}</small>
                          )}
                        </div>

                        {/* Datatype */}
                        <div className="col-span-2">
                          <Controller
                            name={`parameters.${index}.datatype`}
                            control={control}
                            render={({ field: f }) => (
                              <Dropdown
                                value={f.value}
                                options={DATATYPE_OPTIONS}
                                onChange={(e) => f.onChange(e.value)}
                                placeholder="Type"
                                className={`w-full text-sm ${errors.parameters?.[index]?.datatype ? 'p-invalid' : ''}`}
                              />
                            )}
                          />
                          {errors.parameters?.[index]?.datatype && (
                            <small className="text-red-500 text-xs">{errors.parameters[index]?.datatype?.message}</small>
                          )}
                        </div>

                        {/* isKeyField */}
                        <div className="col-span-2 flex justify-center">
                          <Controller
                            name={`parameters.${index}.isKeyField`}
                            control={control}
                            render={({ field: f }) => (
                              <Checkbox
                                inputId={`isKeyField-${index}`}
                                checked={!!f.value}
                                onChange={(e) => f.onChange(e.checked)}
                              />
                            )}
                          />
                        </div>

                        {/* isSensitive */}
                        <div className="col-span-1 flex justify-center">
                          <Controller
                            name={`parameters.${index}.isSensitive`}
                            control={control}
                            render={({ field: f }) => (
                              <Checkbox
                                inputId={`isSensitive-${index}`}
                                checked={!!f.value}
                                onChange={(e) => f.onChange(e.checked)}
                              />
                            )}
                          />
                        </div>

                        {/* Remove */}
                        <div className="col-span-1 flex justify-center">
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                            title={fields.length === 1 ? 'At least one parameter is required' : 'Remove parameter'}
                            className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <i className="pi pi-trash text-sm" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 rounded-b-lg">
              <Button type="button" label="Cancel" severity="secondary" outlined onClick={handleCancel} disabled={isSaving} />
              <Button type="button" label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'} icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'} disabled={isSaving} onClick={handleSubmit(onSubmit)} />
            </div>
          </div >
        </form >

        <DiscardChangesDialog visible={showLeaveDialog} onStay={cancelLeave} onLeave={confirmLeave} testId="LogMasterForm.Dialog.Leave" />
      </div >
    </PermissionGuard >
  );
};

export default LogMasterForm;
