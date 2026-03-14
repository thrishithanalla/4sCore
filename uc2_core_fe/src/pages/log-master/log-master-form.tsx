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
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';

import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';

import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { logMasterService } from '../../services/log-master.service';
import { getModulesForDropdown } from '../../services/feedback-master.service';
import { JOB_NAMES } from '../../constants/jobNames';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const extractApiError = (error: any): string | null => {
  const detail = error?.response?.data?.detail;
  if (detail && typeof detail === 'object') {
    return detail.message || detail.error?.errorCode || null;
  }
  const msg =
    error?.response?.data?.message ??
    error?.response?.data?.error ??
    error?.message;
  return msg ? String(msg) : null;
};

// Extract placeholders from template like {username}, {time}, etc.
const extractPlaceholders = (template: string): string[] => {
  const regex = /\{(\w+)\}/g;
  const placeholders: string[] = [];
  let match;
  while ((match = regex.exec(template)) !== null) {
    if (!placeholders.includes(match[1])) {
      placeholders.push(match[1]);
    }
  }
  return placeholders;
};

// Generate JSON object from placeholders
const generateJsonFromPlaceholders = (placeholders: string[]): Record<string, string> => {
  const json: Record<string, string> = {};
  placeholders.forEach((key) => {
    json[key] = key;
  });
  return json;
};

// -----------------------------------------------------------------------------
// Zod Schema
// -----------------------------------------------------------------------------

const logMasterSchema = z.object({
  moduleId: z.string().min(1, 'Module is required'),
  name: z.string().min(1, 'Name is required').max(120, 'Must be <= 120 characters').trim(),
  purpose: z.string().min(1, 'Purpose is required').max(500, 'Must be <= 500 characters').trim(),
  template: z.string().min(1, 'Template is required').max(1000, 'Must be <= 1000 characters').trim(),
  json: z.string().optional().or(z.literal('')),
  retentionPeriod: z
    .string()
    .min(1, 'Retention Period is required')
    .refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Must be a positive number'),
});

export type LogMasterFormData = z.infer<typeof logMasterSchema>;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const LogMasterForm = () => {
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'log-master',
    basePath: '/log-master',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: modules = [] } = useQuery({
    queryKey: ['modules', 'dropdown'],
    queryFn: getModulesForDropdown,
    staleTime: 5 * 60 * 1000,
  });

  const moduleOptions = modules.map((m) => ({
    label: m.name,
    value: m._id,
  }));

  const { data: existing, isLoading: fetchLoading } = useQuery({
    queryKey: ['log-master', id],
    queryFn: () => logMasterService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title
  useBreadcrumbTitle(isEditMode ? 'Edit Log Master' : 'Create Log Master');

  // ---------------------------------------------------------------------------
  // Form Setup
  // ---------------------------------------------------------------------------

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<LogMasterFormData>({
    resolver: zodResolver(logMasterSchema) as Resolver<LogMasterFormData>,
    defaultValues: {
      moduleId: '',
      name: '',
      purpose: '',
      template: '',
      json: '{}',
      retentionPeriod: '90',
    },
    mode: 'onChange',
  });

  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({
    when: isDirty,
  });

  // Handle cancel/back navigation
  const handleCancel = () => {
    handleNavigate('/log-master');
  };

  // Watch values
  const templateValue = watch('template');
  const jsonValue = watch('json');

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Auto-generate JSON from template placeholders
  useEffect(() => {
    if (templateValue) {
      const placeholders = extractPlaceholders(templateValue);
      if (placeholders.length > 0) {
        const generatedJson = generateJsonFromPlaceholders(placeholders);
        try {
          const currentJson = JSON.parse(jsonValue || '{}');
          const currentKeys = Object.keys(currentJson);
          const isAutoGenerated = currentKeys.every((key) => currentJson[key] === key);
          if (currentKeys.length === 0 || isAutoGenerated) {
            setValue('json', JSON.stringify(generatedJson, null, 2));
          }
        } catch {
          setValue('json', JSON.stringify(generatedJson, null, 2));
        }
      }
    }
  }, [templateValue, setValue]);

  // Populate form in edit mode
  useEffect(() => {
    if (existing && isEditMode) {
      reset({
        moduleId: existing.moduleId || '',
        name: existing.name || '',
        purpose: existing.purpose || '',
        template: existing.template || '',
        json: existing.json ? JSON.stringify(existing.json, null, 2) : '{}',
        retentionPeriod: existing.retentionPeriod?.toString() || '90',
      });
    }
  }, [existing, isEditMode, reset]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const createMut = useMutation({
    mutationFn: (payload: any) => logMasterService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['log-master'] });
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Log Master created successfully',
        life: 3000,
      });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to create Log Master',
        life: 10000,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => logMasterService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['log-master'] });
      queryClient.invalidateQueries({ queryKey: ['log-master', id] });
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Log Master updated successfully',
        life: 3000,
      });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to update Log Master',
        life: 10000,
      });
    },
  });

  // Combined loading state for button disable
  const isSaving = createMut.isPending || updateMut.isPending;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const onSubmit = (data: LogMasterFormData) => {
    let parsedJson: Record<string, string> = {};
    try {
      parsedJson = JSON.parse(data.json || '{}');
    } catch {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Invalid JSON format',
        life: 10000,
      });
      return;
    }

    const payload: any = {
      moduleId: data.moduleId,
      name: data.name,
      purpose: data.purpose,
      template: data.template,
      json: parsedJson,
      retentionPeriod: Number(data.retentionPeriod),
    };

    if (isEditMode) {
      delete payload.name;
      updateMut.mutate(payload);
    } else {
      createMut.mutate(payload);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
          >
            <i className="pi pi-arrow-left text-lg" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {isEditMode ? 'Edit Log Master' : 'Create Log Master'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isEditMode ? 'Update log master configuration' : 'Create a new log template with module association'}
            </p>
          </div>
        </div>

        {/* Form */}
        <form id="log-master-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Main Form Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            {/* Form Fields */}
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Module Dropdown */}
                <Controller
                  name="moduleId"
                  control={control}
                  render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Module <span className="text-red-500">*</span>
                      </label>
                      <Dropdown
                        value={field.value}
                        options={moduleOptions}
                        onChange={(e) => field.onChange(e.value)}
                        placeholder="Select module..."
                        filter
                        filterPlaceholder="Search modules..."
                        className={`w-full ${errors.moduleId ? 'p-invalid' : ''}`}
                        showClear
                      />
                      {errors.moduleId && (
                        <small className="text-red-500">{errors.moduleId.message}</small>
                      )}
                    </div>
                  )}
                />

                {/* Name */}
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <InputText
                        id="name"
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        placeholder="Enter log name (e.g., LogOut, LoginSuccess)"
                        className={`w-full ${errors.name ? 'p-invalid' : ''}`}
                        disabled={isEditMode}
                      />
                      {errors.name && (
                        <small className="text-red-500">{errors.name.message}</small>
                      )}
                    </div>
                  )}
                />

                {/* Retention Period */}
                <Controller
                  name="retentionPeriod"
                  control={control}
                  render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Retention Period (days) <span className="text-red-500">*</span>
                      </label>
                      <InputNumber
                        id="retentionPeriod"
                        value={field.value ? Number(field.value) : null}
                        onValueChange={(e) => field.onChange(e.value?.toString() || '')}
                        placeholder="Enter retention period in days"
                        className={`w-full ${errors.retentionPeriod ? 'p-invalid' : ''}`}
                        min={1}
                        useGrouping={false}
                      />
                      {errors.retentionPeriod && (
                        <small className="text-red-500">{errors.retentionPeriod.message}</small>
                      )}
                    </div>
                  )}
                />

                {/* Purpose */}
                <div className="md:col-span-2">
                  <Controller
                    name="purpose"
                    control={control}
                    render={({ field }) => (
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Purpose <span className="text-red-500">*</span>
                        </label>
                        <InputTextarea
                          id="purpose"
                          value={field.value || ''}
                          onChange={(e) => field.onChange(e.target.value)}
                          placeholder="Enter the purpose of this log"
                          rows={3}
                          className={`w-full ${errors.purpose ? 'p-invalid' : ''}`}
                        />
                        {errors.purpose && (
                          <small className="text-red-500">{errors.purpose.message}</small>
                        )}
                      </div>
                    )}
                  />
                </div>

                {/* Template */}
                <div className="md:col-span-2">
                  <Controller
                    name="template"
                    control={control}
                    render={({ field }) => (
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Template <span className="text-red-500">*</span>
                        </label>
                        <InputTextarea
                          id="template"
                          value={field.value || ''}
                          onChange={(e) => field.onChange(e.target.value)}
                          placeholder="Enter template with placeholders, e.g., User {username} logged out successfully at {time}"
                          rows={4}
                          className={`w-full ${errors.template ? 'p-invalid' : ''}`}
                        />
                        {errors.template ? (
                          <small className="text-red-500">{errors.template.message}</small>
                        ) : (
                          <small className="text-gray-500">
                            Use {'{placeholder}'} syntax to define variables. JSON will be auto-generated.
                          </small>
                        )}
                      </div>
                    )}
                  />
                </div>

                {/* JSON */}
                <div className="md:col-span-2">
                  <Controller
                    name="json"
                    control={control}
                    render={({ field }) => (
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          JSON
                        </label>
                        <InputTextarea
                          id="json"
                          value={field.value || ''}
                          onChange={(e) => field.onChange(e.target.value)}
                          placeholder='{"username": "username"}'
                          rows={8}
                          className="w-full font-mono text-sm"
                        />
                        <small className="text-gray-500">
                          Auto-generated from template placeholders. You can edit this manually.
                        </small>
                      </div>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 rounded-b-lg">
              <Button
                type="button"
                label="Cancel"
                severity="secondary"
                outlined
                onClick={handleCancel}
                disabled={isSaving}
              />
              <Button
                type="button"
                label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
                icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
                disabled={isSaving}
                onClick={handleSubmit(onSubmit)}
              />
            </div>
          </div>
        </form>

        {/* Leave confirmation */}
        <DiscardChangesDialog
          visible={showLeaveDialog}
          onStay={cancelLeave}
          onLeave={confirmLeave}
          testId="LogMasterForm.Dialog.Leave"
        />
      </div>
    </PermissionGuard>
  );
};

export default LogMasterForm;
