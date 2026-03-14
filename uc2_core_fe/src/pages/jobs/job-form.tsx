/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
import { Checkbox } from 'primereact/checkbox';
import { MultiSelect } from 'primereact/multiselect';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Toast } from 'mainFe/Toast';
import { InputTextarea } from 'primereact/inputtextarea';
import { Button } from 'mainFe/Button';
import { Input } from 'mainFe/Input';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';

import { jobsService } from '../../services/jobs.service';
import { modulesService } from '../../services/modules.service';
import { valueSetsService } from '../../services/value-sets.service';
import { extractErrorMessage } from '../../utils/error-handler';

// -----------------------------------------------------------------------------
// Zod Schema - description is optional
// -----------------------------------------------------------------------------

const jobSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Must be ≤ 120 characters').trim(),
  shortCode: z.string().min(1, 'Short Code is required').max(50, 'Must be ≤ 50 characters').trim(),
  description: z.string().max(500, 'Must be ≤ 500 characters').trim().optional(),
  displayName: z.string().min(1, 'Display Name is required').max(120, 'Must be ≤ 120 characters').trim(),
  route: z.string().min(1, 'Route is required').max(120, 'Must be ≤ 120 characters').trim(),
  menuEligible: z.boolean().optional().default(true),
  displayOrder: z.union([z.number(), z.string()]).optional().transform((val) => {
    if (val === '' || val === undefined || val === null) return undefined;
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    return isNaN(num) ? undefined : num;
  }),
  allowedPermissions: z.array(z.string()).default([]),
});

export type JobFormData = z.infer<typeof jobSchema>;

// -----------------------------------------------------------------------------
// Component Props
// -----------------------------------------------------------------------------

interface JobFormProps {
  /** When true, renders as dialog content without header/navigation */
  dialogMode?: boolean;
  /** Callback when job is created successfully in dialog mode */
  onSuccess?: (newJob: { _id: string; name: string }) => void;
  /** Callback to close dialog */
  onCancel?: () => void;
  /** Optional: Module ID - if provided, creates embedded job in module */
  moduleId?: string;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const JobForm = ({ dialogMode = false, onSuccess, onCancel, moduleId }: JobFormProps) => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'jobs',
    basePath: '/jobs',
  });
  const isEditMode = !dialogMode && Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  // Fetch permissions from value-sets API (only in dialog mode when creating for a module)
  const { data: permissionsData } = useQuery({
    queryKey: ['value-sets', 'PERMISSIONS'],
    queryFn: () => valueSetsService.getByKey('PERMISSIONS'),
    enabled: dialogMode && !!moduleId, // Only fetch when in dialog mode with moduleId
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  // Transform permissions: display code, use label as value
  const permissionOptions = (permissionsData?.items || []).map((item) => ({
    label: item.code, // Display the code (e.g., "CREATE")
    value: item.label, // Use label as value (e.g., "Create")
  }));

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema) as Resolver<JobFormData>,
    defaultValues: {
      name: '',
      shortCode: '',
      description: '',
      displayName: '',
      route: '',
      menuEligible: true,
      displayOrder: undefined,
      allowedPermissions: [],
    },
    mode: 'onChange',
  });

  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty && !dialogMode });

  // Fetch existing entity when editing
  const { data: existing, isLoading: fetchLoading } = useQuery({
    queryKey: ['jobs', id],
    queryFn: async () => await jobsService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show job name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? existing?.name : null);

  useEffect(() => {
    if (existing && isEditMode) {
      reset({
        name: existing.name,
        shortCode: existing.shortCode || '',
        description: existing.description || '',
        displayName: existing.displayName || '',
        route: existing.route || '',
        menuEligible: existing.menuEligible ?? true,
        displayOrder: existing.displayOrder,
        allowedPermissions: (existing as any).allowedPermissions || [],
      });
    }
  }, [existing, isEditMode, reset]);

  // Mutation for creating embedded job in module
  const createMut = useMutation({
    mutationFn: ({ moduleId, payload }: { moduleId: string; payload: any }) =>
      modulesService.addJob(moduleId, payload),
    onSuccess: (moduleData: any) => {
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      queryClient.invalidateQueries({ queryKey: ['module-hierarchy'] });

      // Extract the newly created job from the module response
      const newJob = moduleData.jobs?.[moduleData.jobs.length - 1];

      // Show success toast
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Job added to module successfully', life: 3000 });

      // In dialog mode, call onSuccess callback
      if (dialogMode && onSuccess && newJob) {
        onSuccess({ _id: newJob._id || '', name: newJob.name });
        return;
      }

      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const errorMessage = extractErrorMessage(error, 'Failed to add job to module');
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 10000,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => jobsService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', id] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Job updated successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const errorMessage = extractErrorMessage(error, 'Failed to update Job');
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 10000,
      });
    },
  });

  // Combined loading state for button disable
  const isSaving = createMut.isPending || updateMut.isPending;

  // Submit
  const onSubmit = (data: JobFormData) => {
    const payload: any = {
      name: data.name,
      shortCode: data.shortCode,
      displayName: data.displayName,
      route: data.route,
      menuEligibility: data.menuEligible ?? true,
      allowedPermissions: data.allowedPermissions || [],
    };

    // Only include description if it has a value
    if (data.description && data.description.trim()) {
      payload.description = data.description;
    }

    // Include displayOrder if provided
    if (data.displayOrder !== undefined && data.displayOrder !== null) {
      payload.displayOrder = data.displayOrder;
    }

    if (isEditMode) {
      updateMut.mutate(payload);
    } else if (moduleId) {
      createMut.mutate({ moduleId, payload });
    }
  };

  // Loading state
  if (fetchLoading) {
    return (
      <div className={dialogMode ? 'py-4 flex justify-center items-center' : 'py-4 px-4 flex justify-center items-center'}>
        <ProgressSpinner />
      </div>
    );
  }

  // Dialog mode - simplified form without page wrapper
  if (dialogMode) {
    return (
      <>
        <Toast ref={toast} position="top-right" />
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 gap-3">
            {/* Name */}
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    name={field.name}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder="Enter job name"
                    testId="JobForm.Input.Name"
                    className="w-full"
                  />
                  {errors.name && (
                    <small className="text-red-500">{errors.name.message}</small>
                  )}
                </div>
              )}
            />

            {/* Short Code */}
            <Controller
              name="shortCode"
              control={control}
              render={({ field }) => (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Short Code <span className="text-red-500">*</span>
                  </label>
                  <Input
                    name={field.name}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder="Enter short code"
                    testId="JobForm.Input.ShortCode"
                    className="w-full"
                  />
                  {errors.shortCode && (
                    <small className="text-red-500">{errors.shortCode.message}</small>
                  )}
                </div>
              )}
            />

            {/* Description */}
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description (Optional)
                  </label>
                  <InputTextarea
                    {...field}
                    value={field.value ?? ''}
                    rows={3}
                    placeholder="Enter job description"
                    className="w-full resize-none"
                    data-testid="JobForm.Input.Description"
                    style={{ maxHeight: '120px' }}
                  />
                  {errors.description && (
                    <small className="text-red-500">{errors.description.message}</small>
                  )}
                </div>
              )}
            />

            {/* Display Name */}
            <Controller
              name="displayName"
              control={control}
              render={({ field }) => (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Display Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    name={field.name}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder="e.g., ManageUsers"
                    testId="JobForm.Input.DisplayName"
                    className="w-full"
                  />
                  {errors.displayName && (
                    <small className="text-red-500">{errors.displayName.message}</small>
                  )}
                </div>
              )}
            />

            {/* Route */}
            <Controller
              name="route"
              control={control}
              render={({ field }) => (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Route <span className="text-red-500">*</span>
                  </label>
                  <Input
                    name={field.name}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder="e.g., manage-users"
                    testId="JobForm.Input.Route"
                    className="w-full"
                  />
                  {errors.route && (
                    <small className="text-red-500">{errors.route.message}</small>
                  )}
                </div>
              )}
            />

            {/* Menu Eligible */}
            <Controller
              name="menuEligible"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    inputId="menuEligibleDialog"
                    checked={field.value ?? true}
                    onChange={(e) => field.onChange(e.checked)}
                    data-testid="JobForm.Checkbox.MenuEligible"
                  />
                  <label
                    htmlFor="menuEligibleDialog"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                  >
                    Menu Eligible
                  </label>
                </div>
              )}
            />

            {/* Allowed Permissions - Only show in dialog mode with moduleId */}
            {moduleId && (
              <Controller
                name="allowedPermissions"
                control={control}
                render={({ field }) => (
                  <div>
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
                      data-testid="JobForm.MultiSelect.AllowedPermissions"
                    />
                    <small className="text-gray-500 text-xs mt-1">
                      Select which actions are allowed for this job
                    </small>
                  </div>
                )}
              />
            )}

          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end mt-6">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              outlined
              onClick={onCancel}
              disabled={isSaving}
            />
            <Button
              type="submit"
              label={isSaving ? 'Creating...' : 'Create Job'}
              icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
              disabled={isSaving}
              testId="JobForm.Button.Submit"
            />
          </div>
        </form>
      </>
    );
  }

  // Full page mode
  return (
    <>
      <Toast ref={toast} position="top-right" />

      <div className="py-4 px-4" data-testid="SCR-Job-Form">
        {/* Header */}
        <div className="mb-3">
          <button
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-3"
            onClick={() => handleNavigate('/jobs')}
          >
            <i className="pi pi-arrow-left" style={{ fontSize: '1.25rem' }} />
            Back to Jobs
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {isEditMode ? 'Edit Job' : 'Create Job'}
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Job Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Name */}
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      name={field.name}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="Enter job name"
                      testId="JobForm.Input.Name"
                      className="w-full"
                    />
                    {errors.name && (
                      <small className="text-red-500">{errors.name.message}</small>
                    )}
                  </div>
                )}
              />

              {/* Short Code */}
              <Controller
                name="shortCode"
                control={control}
                render={({ field }) => (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Short Code <span className="text-red-500">*</span>
                    </label>
                    <Input
                      name={field.name}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="Enter short code"
                      testId="JobForm.Input.ShortCode"
                      className="w-full"
                    />
                    {errors.shortCode && (
                      <small className="text-red-500">{errors.shortCode.message}</small>
                    )}
                  </div>
                )}
              />

              {/* Description - Full Width and Optional */}
              <div className="md:col-span-2">
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description (Optional)
                      </label>
                      <InputTextarea
                        {...field}
                        value={field.value ?? ''}
                        rows={4}
                        placeholder="Enter job description"
                        className="w-full"
                        data-testid="JobForm.Input.Description"
                      />
                      {errors.description && (
                        <small className="text-red-500">{errors.description.message}</small>
                      )}
                    </div>
                  )}
                />
              </div>

              {/* Display Name */}
              <Controller
                name="displayName"
                control={control}
                render={({ field }) => (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Display Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      name={field.name}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="e.g., ManageUsers"
                      testId="JobForm.Input.DisplayName"
                      className="w-full"
                    />
                    {errors.displayName && (
                      <small className="text-red-500">{errors.displayName.message}</small>
                    )}
                  </div>
                )}
              />

              {/* Route */}
              <Controller
                name="route"
                control={control}
                render={({ field }) => (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Route <span className="text-red-500">*</span>
                    </label>
                    <Input
                      name={field.name}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="e.g., manage-users"
                      testId="JobForm.Input.Route"
                      className="w-full"
                    />
                    {errors.route && (
                      <small className="text-red-500">{errors.route.message}</small>
                    )}
                  </div>
                )}
              />

              {/* Menu Eligible */}
              <Controller
                name="menuEligible"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2 mt-4">
                    <Checkbox
                      inputId="menuEligible"
                      checked={field.value ?? true}
                      onChange={(e) => field.onChange(e.checked)}
                      data-testid="JobForm.Checkbox.MenuEligible"
                    />
                    <label
                      htmlFor="menuEligible"
                      className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                    >
                      Menu Eligible
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                        (If unchecked, this job cannot appear in menus)
                      </span>
                    </label>
                  </div>
                )}
              />

              {/* Display Order - Commented out as per requirement
              <Controller
                name="displayOrder"
                control={control}
                render={({ field }) => (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Display Order
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(Auto-set if empty)</span>
                    </label>
                    <Input
                      name={field.name}
                      value={field.value ?? ''}
                      onChange={(val: string) => field.onChange(val)}
                      placeholder="e.g., 1"
                      testId="JobForm.Input.DisplayOrder"
                      className="w-full"
                      type="number"
                    />
                    {errors.displayOrder && (
                      <small className="text-red-500">{errors.displayOrder.message}</small>
                    )}
                  </div>
                )}
              />
              */}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => handleNavigate('/jobs')}
              disabled={isSaving}
            />
            <Button
              type="submit"
              label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
              icon={isSaving ? 'pi pi-spin pi-spinner' : undefined}
              disabled={isSaving}
              testId="JobForm.Button.Submit"
            />
          </div>
        </form>
      </div>

      {/* Leave confirmation */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="JobForm.Dialog.Leave"
      />
    </>
  );
};

export default JobForm;
