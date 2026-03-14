/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
import { Toast } from 'mainFe/Toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import { InputTextarea } from 'primereact/inputtextarea';
// InputNumber removed - using custom stepper UI
import { Checkbox } from 'primereact/checkbox';
import { MultiSelect } from 'primereact/multiselect';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Divider } from 'primereact/divider';
import { Tag } from 'primereact/tag';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Controller, useForm, useFieldArray, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';

import FormInput from '../../components/forms/form-input';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';

import { modulesService } from '../../services/modules.service';
import { valueSetsService } from '../../services/value-sets.service';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const extractApiError = (error: any): string | null => {
  // Handle new API response format: { detail: { success, code, message, data, error } }
  const detail = error?.response?.data?.detail;
  if (detail && typeof detail === 'object') {
    return detail.message || detail.error?.errorCode || null;
  }
  // Handle direct message formats
  const msg =
    error?.response?.data?.message ??
    error?.response?.data?.error ??
    error?.message;
  return msg ? String(msg) : null;
};

// -----------------------------------------------------------------------------
// Zod Schema
// -----------------------------------------------------------------------------

const jobSchema = z.object({
  name: z.string().min(1, 'Job name is required').max(120, 'Must be ≤ 120 characters').trim(),
  shortCode: z.string().min(1, 'Short code is required').max(20, 'Must be ≤ 20 characters').trim(),
  description: z.string().max(500, 'Must be ≤ 500 characters').optional(),
  displayName: z.string().min(1, 'Display name is required').max(120, 'Must be ≤ 120 characters').trim(),
  route: z.string().min(1, 'Route is required').max(120, 'Must be ≤ 120 characters').trim(),
  menuEligibility: z.boolean().default(true),
  displayOrder: z.number().min(1, 'Display order must be at least 1').default(1),
  allowedPermissions: z.array(z.string()).default([]),
});

const moduleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Must be ≤ 120 characters').trim(),
  shortCode: z.string().min(1, 'Short Code is required').max(50, 'Must be ≤ 50 characters').trim(),
  description: z.string().min(1, 'Description is required').max(500, 'Must be ≤ 500 characters').trim(),
  displayOrder: z.number().min(1, 'Display Order must be at least 1'),
  jobs: z.array(jobSchema).default([]),
});

export type JobFormData = z.infer<typeof jobSchema>;
export type ModuleFormData = z.infer<typeof moduleSchema>;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const ModuleForm = () => {
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'modules',
    basePath: '/modules',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const [activeJobIndex, setActiveJobIndex] = useState<number | number[] | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<ModuleFormData>({
    resolver: zodResolver(moduleSchema) as Resolver<ModuleFormData>,
    defaultValues: {
      name: '',
      shortCode: '',
      description: '',
      displayOrder: 1,
      jobs: [],
    },
    mode: 'onChange',
  });

  const { fields: jobFields, append: appendJob, remove: removeJob } = useFieldArray({
    control,
    name: 'jobs',
  });

  // Navigation blocker for unsaved changes
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Fetch existing entity when editing
  const { data: existing, isLoading: fetchLoading } = useQuery({
    queryKey: ['modules', id],
    queryFn: async () => await modulesService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Fetch permissions from value-sets API
  const { data: permissionsData } = useQuery({
    queryKey: ['value-sets', 'PERMISSIONS'],
    queryFn: () => valueSetsService.getByKey('PERMISSIONS'),
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  // Transform permissions: display code, use label as value
  const permissionOptions = (permissionsData?.items || []).map((item) => ({
    label: item.code, // Display the code (e.g., "CREATE")
    value: item.label, // Use label as value (e.g., "Create")
  }));

  // Set breadcrumb title to show module name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? existing?.name : null);

  useEffect(() => {
    if (existing && isEditMode) {
      reset({
        name: existing.name,
        shortCode: existing.shortCode || '',
        description: existing.description || '',
        displayOrder: existing.displayOrder || 1,
        jobs: (existing.jobs || []).map(job => ({
          name: job.name,
          shortCode: job.shortCode,
          description: job.description || '',
          displayName: job.displayName,
          route: job.route,
          menuEligibility: job.menuEligibility ?? true,
          displayOrder: job.displayOrder ?? 1,
          allowedPermissions: job.allowedPermissions || [],
        })),
      });
    }
  }, [existing, isEditMode, reset]);

  // Add new job
  const handleAddJob = useCallback(() => {
    appendJob({
      name: '',
      shortCode: '',
      description: '',
      displayName: '',
      route: '',
      menuEligibility: true,
      displayOrder: jobFields.length + 1,
      allowedPermissions: [],
    });
    // Expand the newly added job
    setActiveJobIndex(jobFields.length);
  }, [appendJob, jobFields.length]);

  // Remove job with confirmation
  const handleRemoveJob = useCallback((index: number, jobName: string) => {
    confirmDialog({
      message: `Are you sure you want to remove the job "${jobName || 'Untitled'}"?`,
      header: 'Remove Job',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: () => {
        removeJob(index);
        toast.current?.show({
          severity: 'info',
          summary: 'Job Removed',
          detail: `Job "${jobName || 'Untitled'}" has been removed`,
          life: 3000,
        });
      },
    });
  }, [removeJob]);

  // Mutations
  const createMut = useMutation({
    mutationFn: (payload: any) => modulesService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Module created successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to save Module',
        life: 10000,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => modulesService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      queryClient.invalidateQueries({ queryKey: ['modules', id] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Module updated successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to save Module',
        life: 10000,
      });
    },
  });

  // Combined loading state for button disable
  const isSaving = createMut.isPending || updateMut.isPending;

  // Submit
  const onSubmit = (data: ModuleFormData) => {
    const payload = {
      name: data.name,
      shortCode: data.shortCode,
      description: data.description,
      displayOrder: data.displayOrder,
      jobs: data.jobs.map(job => ({
        name: job.name,
        shortCode: job.shortCode,
        description: job.description || undefined,
        displayName: job.displayName,
        route: job.route,
        menuEligibility: job.menuEligibility,
        displayOrder: job.displayOrder,
        allowedPermissions: job.allowedPermissions,
      })),
    };

    if (isEditMode) {
      // For update, we need to handle jobs separately via API if editing existing module
      // For now, send just the module fields for update
      updateMut.mutate({
        name: data.name,
        shortCode: data.shortCode,
        description: data.description,
        displayOrder: data.displayOrder,
      });
    } else {
      createMut.mutate(payload);
    }
  };

  // Loading state
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
      <ConfirmDialog />

      <div className="p-3" data-testid="SCR-Module-Form">
        {/* Main Card Container */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-4">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleNavigate('/modules')}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
              >
                <i className="pi pi-arrow-left text-lg" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {isEditMode ? 'Edit Module' : 'Create New Module'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isEditMode
                    ? 'Update module information. Jobs can be managed in the view page.'
                    : 'Create a new module with optional jobs and permissions.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                label="Cancel"
                icon="pi pi-times"
                severity="secondary"
                outlined
                onClick={() => handleNavigate('/modules')}
                disabled={isSaving}
                size="small"
              />
              <Button
                type="button"
                label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
                icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
                disabled={isSaving}
                size="small"
                onClick={handleSubmit(onSubmit)}
              />
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Module Information Section */}
            <div className="border border-gray-200 dark:border-gray-700 rounded p-3 mb-3">
              <h3 className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">
                Module Information
              </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Name */}
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <FormInput
                    name={field.name}
                    label="Name"
                    value={field.value ?? ''}
                    onChange={(e: any) => field.onChange(e)}
                    error={!!errors.name}
                    helperText={errors.name?.message as string}
                    required
                    placeholder="Enter module name"
                  />
                )}
              />

              {/* Short Code */}
              <Controller
                name="shortCode"
                control={control}
                render={({ field }) => (
                  <FormInput
                    name={field.name}
                    label="Short Code"
                    value={field.value ?? ''}
                    onChange={(e: any) => field.onChange(e)}
                    error={!!errors.shortCode}
                    helperText={errors.shortCode?.message as string}
                    required
                    placeholder="Enter short code"
                  />
                )}
              />

              {/* Display Order */}
              <Controller
                name="displayOrder"
                control={control}
                render={({ field }) => (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Display Order <span className="text-red-500">*</span>
                    </label>
                    <div className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => field.onChange(Math.max(1, (field.value || 1) - 1))}
                        className="flex items-center justify-center w-10 h-10 rounded-l-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={field.value <= 1}
                      >
                        <i className="pi pi-minus text-sm" />
                      </button>
                      <div className={`flex items-center justify-center w-16 h-10 border-t border-b ${errors.displayOrder ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium`}>
                        {field.value || 1}
                      </div>
                      <button
                        type="button"
                        onClick={() => field.onChange((field.value || 1) + 1)}
                        className="flex items-center justify-center w-10 h-10 rounded-r-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
                      >
                        <i className="pi pi-plus text-sm" />
                      </button>
                    </div>
                    {errors.displayOrder && (
                      <small className="text-red-500 mt-1 block">{errors.displayOrder.message}</small>
                    )}
                  </div>
                )}
              />

              {/* Description - Full Width */}
              <div className="md:col-span-2">
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description <span className="text-red-500">*</span>
                      </label>
                      <InputTextarea
                        {...field}
                        rows={4}
                        className={`w-full ${errors.description ? 'p-invalid' : ''}`}
                        placeholder="Enter module description"
                      />
                      {errors.description && (
                        <small className="text-red-500">{errors.description.message}</small>
                      )}
                    </div>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Jobs Section - Only show in Create mode */}
          {!isEditMode && (
            <div className="border border-gray-200 dark:border-gray-700 rounded p-3 mt-3">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Jobs
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Add jobs to this module (optional). Each job represents a feature or action within the module.
                  </p>
                </div>
                <Button
                  type="button"
                  label="Add Job"
                  icon="pi pi-plus"
                  size="small"
                  outlined
                  onClick={handleAddJob}
                />
              </div>

              {jobFields.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded">
                  <i className="pi pi-briefcase text-3xl text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">No jobs added yet</p>
                  <Button
                    type="button"
                    label="Add Your First Job"
                    icon="pi pi-plus"
                    size="small"
                    onClick={handleAddJob}
                  />
                </div>
              ) : (
                <Accordion
                  activeIndex={activeJobIndex}
                  onTabChange={(e) => setActiveJobIndex(e.index)}
                  multiple={false}
                >
                  {jobFields.map((field, index) => {
                    const jobName = watch(`jobs.${index}.name`) || `Job ${index + 1}`;
                    const jobPermissions = watch(`jobs.${index}.allowedPermissions`) || [];

                    return (
                      <AccordionTab
                        key={field.id}
                        header={
                          <div className="flex items-center justify-between w-full pr-4">
                            <div className="flex items-center gap-2">
                              <i className="pi pi-briefcase text-blue-500" />
                              <span className="font-medium">{jobName}</span>
                              {jobPermissions.length > 0 && (
                                <Tag value={`${jobPermissions.length} permissions`} severity="info" className="ml-2" />
                              )}
                            </div>
                          </div>
                        }
                      >
                        <div className="pt-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            {/* Job Name */}
                            <Controller
                              name={`jobs.${index}.name`}
                              control={control}
                              render={({ field }) => (
                                <FormInput
                                  name={field.name}
                                  label="Job Name"
                                  value={field.value ?? ''}
                                  onChange={(e: any) => field.onChange(e)}
                                  error={!!errors.jobs?.[index]?.name}
                                  helperText={errors.jobs?.[index]?.name?.message as string}
                                  required
                                  placeholder="e.g., USERS, REPORTS"
                                />
                              )}
                            />

                            {/* Job Short Code */}
                            <Controller
                              name={`jobs.${index}.shortCode`}
                              control={control}
                              render={({ field }) => (
                                <FormInput
                                  name={field.name}
                                  label="Short Code"
                                  value={field.value ?? ''}
                                  onChange={(e: any) => field.onChange(e)}
                                  error={!!errors.jobs?.[index]?.shortCode}
                                  helperText={errors.jobs?.[index]?.shortCode?.message as string}
                                  required
                                  placeholder="e.g., USR, RPT"
                                />
                              )}
                            />

                            {/* Display Name */}
                            <Controller
                              name={`jobs.${index}.displayName`}
                              control={control}
                              render={({ field }) => (
                                <FormInput
                                  name={field.name}
                                  label="Display Name"
                                  value={field.value ?? ''}
                                  onChange={(e: any) => field.onChange(e)}
                                  error={!!errors.jobs?.[index]?.displayName}
                                  helperText={errors.jobs?.[index]?.displayName?.message as string}
                                  required
                                  placeholder="e.g., User Management"
                                />
                              )}
                            />

                            {/* Route */}
                            <Controller
                              name={`jobs.${index}.route`}
                              control={control}
                              render={({ field }) => (
                                <FormInput
                                  name={field.name}
                                  label="Route"
                                  value={field.value ?? ''}
                                  onChange={(e: any) => field.onChange(e)}
                                  error={!!errors.jobs?.[index]?.route}
                                  helperText={errors.jobs?.[index]?.route?.message as string}
                                  required
                                  placeholder="e.g., /users"
                                />
                              )}
                            />

                            {/* Display Order */}
                            <Controller
                              name={`jobs.${index}.displayOrder`}
                              control={control}
                              render={({ field }) => (
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Display Order
                                  </label>
                                  <div className="inline-flex items-center">
                                    <button
                                      type="button"
                                      onClick={() => field.onChange(Math.max(1, (field.value ?? 1) - 1))}
                                      className="flex items-center justify-center w-10 h-10 rounded-l-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                      disabled={(field.value ?? 1) <= 1}
                                    >
                                      <i className="pi pi-minus text-sm" />
                                    </button>
                                    <div className="flex items-center justify-center w-16 h-10 border-t border-b border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium">
                                      {field.value ?? 1}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => field.onChange((field.value ?? 1) + 1)}
                                      className="flex items-center justify-center w-10 h-10 rounded-r-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
                                    >
                                      <i className="pi pi-plus text-sm" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            />

                            {/* Menu Eligibility */}
                            <Controller
                              name={`jobs.${index}.menuEligibility`}
                              control={control}
                              render={({ field }) => (
                                <div className="flex items-center gap-2 pt-6">
                                  <Checkbox
                                    inputId={`menuEligibility-${index}`}
                                    checked={field.value ?? true}
                                    onChange={(e) => field.onChange(e.checked)}
                                  />
                                  <label htmlFor={`menuEligibility-${index}`} className="text-sm text-gray-700 dark:text-gray-300">
                                    Menu Eligible
                                  </label>
                                </div>
                              )}
                            />
                          </div>

                          {/* Job Description */}
                          <Controller
                            name={`jobs.${index}.description`}
                            control={control}
                            render={({ field }) => (
                              <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Description
                                </label>
                                <InputTextarea
                                  {...field}
                                  value={field.value || ''}
                                  rows={2}
                                  className="w-full"
                                  placeholder="Enter job description (optional)"
                                />
                              </div>
                            )}
                          />

                          {/* Allowed Permissions */}
                          <Controller
                            name={`jobs.${index}.allowedPermissions`}
                            control={control}
                            render={({ field }) => (
                              <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Allowed Permissions
                                </label>
                                <MultiSelect
                                  value={field.value}
                                  options={permissionOptions}
                                  onChange={(e) => field.onChange(e.value)}
                                  placeholder="Select permissions"
                                  filter
                                  filterPlaceholder="Search permissions..."
                                  display="chip"
                                  className="w-full"
                                />
                                <small className="text-gray-500">
                                  Select which actions are allowed for this job
                                </small>
                              </div>
                            )}
                          />

                          <Divider />

                          {/* Remove Job Button */}
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              label="Remove Job"
                              icon="pi pi-trash"
                              severity="danger"
                              size="small"
                              outlined
                              onClick={() => handleRemoveJob(index, jobName)}
                            />
                          </div>
                        </div>
                      </AccordionTab>
                    );
                  })}
                </Accordion>
              )}
            </div>
          )}

          {/* Info message for edit mode */}
          {isEditMode && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3 mt-3">
              <div className="flex items-start gap-3">
                <i className="pi pi-info-circle text-blue-600 dark:text-blue-400 text-lg mt-0.5" />
                <div>
                  <p className="text-blue-800 dark:text-blue-200 font-medium text-sm">Jobs Management</p>
                  <p className="text-blue-700 dark:text-blue-300 text-xs">
                    To add, edit, or remove jobs, please use the module view page after saving.
                    Jobs can be managed individually from the module details view.
                  </p>
                </div>
              </div>
            </div>
          )}
          </form>
        </div>

        {/* Leave confirmation */}
        <DiscardChangesDialog
          visible={showLeaveDialog}
          onStay={cancelLeave}
          onLeave={confirmLeave}
          testId="ModuleForm.Dialog.Leave"
        />
      </div>
    </>
  );
};

export default ModuleForm;
