/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
import { Toast } from 'mainFe/Toast';
import { ProgressSpinner } from 'primereact/progressspinner';
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

import { permissionsService } from '../../services/permissions.service';

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
// Zod Schema - description is optional
// -----------------------------------------------------------------------------

const permissionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Must be ≤ 120 characters').trim(),
  shortCode: z.string().min(1, 'Short Code is required').max(50, 'Must be ≤ 50 characters').trim(),
  description: z.string().max(500, 'Must be ≤ 500 characters').trim().optional(),
});

export type PermissionFormData = z.infer<typeof permissionSchema>;

// -----------------------------------------------------------------------------
// Component Props
// -----------------------------------------------------------------------------

interface PermissionFormProps {
  /** When true, renders as dialog content without header/navigation */
  dialogMode?: boolean;
  /** Callback when permission is created successfully in dialog mode */
  onSuccess?: (newPermission: { _id: string; name: string }) => void;
  /** Callback to close dialog */
  onCancel?: () => void;
  /** Module ID - if provided with jobId, creates permission in job */
  moduleId?: string;
  /** Job ID - if provided with moduleId, creates permission in job */
  jobId?: string;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const PermissionForm = ({ dialogMode = false, onSuccess, onCancel, moduleId, jobId }: PermissionFormProps) => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'permissions',
    basePath: '/permissions',
  });
  const isEditMode = !dialogMode && Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);


  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<PermissionFormData>({
    resolver: zodResolver(permissionSchema) as Resolver<PermissionFormData>,
    defaultValues: {
      name: '',
      shortCode: '',
      description: '',
    },
    mode: 'onChange',
  });

  // Navigation blocker for unsaved changes (only in non-dialog mode)
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty && !dialogMode });

  // Fetch existing entity when editing
  const { data: existing, isLoading: fetchLoading } = useQuery({
    queryKey: ['permissions', id],
    queryFn: async () => await permissionsService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show permission name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? existing?.name : null);

  useEffect(() => {
    if (existing && isEditMode) {
      reset({
        name: existing.name,
        shortCode: existing.shortCode || '',
        description: existing.description || '',
      });
    }
  }, [existing, isEditMode, reset]);

  // Mutation for creating standalone permission
  const createMut = useMutation({
    mutationFn: (payload: any) => permissionsService.create(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['permissions'] });

      // In dialog mode, call onSuccess callback
      if (dialogMode && onSuccess) {
        onSuccess({ _id: data._id, name: data.name });
        return;
      }

      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Permission created successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to save Permission',
        life: 10000,
      });
    },
  });

  // Mutation for adding permission to a job within a module
  const addToJobMut = useMutation({
    mutationFn: ({ moduleId, jobId, payload }: { moduleId: string; jobId: string; payload: any }) =>
      permissionsService.addToJob(moduleId, jobId, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      queryClient.invalidateQueries({ queryKey: ['module-hierarchy'] });

      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Permission added to job successfully', life: 3000 });

      // In dialog mode, call onSuccess callback
      if (dialogMode && onSuccess) {
        onSuccess({ _id: data._id, name: data.name });
        return;
      }

      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to add permission to job',
        life: 10000,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => permissionsService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
      queryClient.invalidateQueries({ queryKey: ['permissions', id] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Permission updated successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to save Permission',
        life: 10000,
      });
    },
  });

  // Combined loading state for button disable
  const isSaving = createMut.isPending || updateMut.isPending || addToJobMut.isPending;

  // Submit
  const onSubmit = (data: PermissionFormData) => {
    const payload: any = {
      name: data.name,
      shortCode: data.shortCode,
    };

    // Only include description if it has a value
    if (data.description && data.description.trim()) {
      payload.description = data.description;
    }

    if (isEditMode) {
      updateMut.mutate(payload);
    } else if (moduleId && jobId) {
      // Add permission to job within module
      addToJobMut.mutate({ moduleId, jobId, payload });
    } else {
      // Create standalone permission
      createMut.mutate(payload);
    }
  };

  // Loading state
  if (fetchLoading) {
    return (
      <div className={dialogMode ? 'py-4 flex justify-center items-center' : 'py-4 px-4 flex justify-center items-center'}>
        <ProgressSpinner style={{ width: '50px', height: '50px' }} />
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
                    placeholder="Enter permission name"
                    testId="PermissionForm.Input.Name"
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
                    testId="PermissionForm.Input.ShortCode"
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
                    value={field.value || ''}
                    rows={3}
                    className="w-full resize-none"
                    placeholder="Enter permission description"
                    data-testid="PermissionForm.Input.Description"
                    style={{ maxHeight: '120px' }}
                  />
                  {errors.description && (
                    <small className="text-red-500">{errors.description.message}</small>
                  )}
                </div>
              )}
            />
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
              label={isSaving ? 'Creating...' : 'Create Permission'}
              icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
              disabled={isSaving}
              testId="PermissionForm.Button.Submit"
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

      <div className="py-4 px-4" data-testid="SCR-Permission-Form">
        {/* Header */}
        <div className="mb-3">
          <Button
            label="Back to Permissions"
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            onClick={() => handleNavigate('/permissions')}
            className="mb-3"
          />
          <h1 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
            {isEditMode ? 'Edit Permission' : 'Create Permission'}
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-3">
            <h3 className="text-base font-semibold mb-4 text-gray-900 dark:text-white">
              Permission Information
            </h3>
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
                      placeholder="Enter permission name"
                      testId="PermissionForm.Input.Name"
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
                      testId="PermissionForm.Input.ShortCode"
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
                        value={field.value || ''}
                        rows={4}
                        className={`w-full ${errors.description ? 'p-invalid' : ''}`}
                        placeholder="Enter permission description"
                        data-testid="PermissionForm.Input.Description"
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

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => handleNavigate('/permissions')}
              disabled={isSaving}
            />
            <Button
              type="submit"
              label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
              icon={isSaving ? 'pi pi-spin pi-spinner' : undefined}
              disabled={isSaving}
              testId="PermissionForm.Button.Submit"
            />
          </div>
        </form>
      </div>

      {/* Leave confirmation */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="PermissionForm.Dialog.Leave"
      />
    </>
  );
};

export default PermissionForm;
