/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
import { Message } from 'primereact/message';
import { Toast } from 'mainFe/Toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';

import FormInput from '../../components/forms/form-input';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

import { departmentsService } from '../../services/departments.service';
import { extractErrorMessage } from '../../utils/error-handler';

// -----------------------------------------------------------------------------
// Zod Schema
// -----------------------------------------------------------------------------

const departmentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Must be ≤ 120 characters').trim(),
  shortCode: z.string().min(1, 'Short code is required').max(10, 'Must be ≤ 10 characters').trim(),
  cctnsDepartmentCd: z.string().max(50, 'Must be ≤ 50 characters').trim().optional().or(z.literal('')),
});

export type DepartmentFormData = z.infer<typeof departmentSchema>;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const DepartmentForm = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'departments',
    basePath: '/departments',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.DEPARTMENTS);
  const canUpdate = useCanUpdate(JOB_NAMES.DEPARTMENTS);
  const hasPermission = isEditMode ? canUpdate : canCreate;


  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<DepartmentFormData>({
    resolver: zodResolver(departmentSchema) as Resolver<DepartmentFormData>,
    defaultValues: {
      name: '',
      shortCode: '',
      cctnsDepartmentCd: '',
    },
    mode: 'onChange',
  });

  // Navigation blocker for unsaved changes
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Fetch existing entity when editing
  const { data: existing, isLoading: fetchLoading } = useQuery({
    queryKey: ['departments', id],
    queryFn: async () => await departmentsService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show department name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? existing?.name : null);

  useEffect(() => {
    if (existing && isEditMode) {
      console.log('Department edit - existing data:', existing);
      reset({
        name: existing.name || '',
        shortCode: existing.shortCode || '',
        cctnsDepartmentCd: existing.cctnsDepartmentCd || '',
      });
    }
  }, [existing, isEditMode, reset]);

  // Mutations
  const createMut = useMutation({
    mutationFn: (payload: any) => departmentsService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Department created successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const errorMessage = extractErrorMessage(error, 'Failed to save Department');
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 10000,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => departmentsService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['departments', id] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Department updated successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const errorMessage = extractErrorMessage(error, 'Failed to save Department');
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
  const onSubmit = (data: DepartmentFormData) => {
    const payload: { name: string; shortCode: string; cctnsDepartmentCd?: string } = {
      name: data.name,
      shortCode: data.shortCode,
    };

    // Only include cctnsDepartmentCd if it has a value
    if (data.cctnsDepartmentCd && data.cctnsDepartmentCd.trim()) {
      payload.cctnsDepartmentCd = data.cctnsDepartmentCd;
    }

    if (isEditMode) updateMut.mutate(payload);
    else createMut.mutate(payload);
  };

  // Loading state
  if (fetchLoading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.DEPARTMENTS}>
      <Toast ref={toast} position="top-right" />

      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900" data-testid="SCR-Department-Form">
        {/* Header - Compact */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleNavigate('/departments')}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
            >
              <i className="pi pi-arrow-left text-lg" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Department' : 'Create Department'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditMode ? 'Update department information' : 'Add a new department'}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Department Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Name */}
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value || ''}
                    label="Name"
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    required
                    placeholder="Enter department name"
                  />
                )}
              />

              {/* Short Code */}
              <Controller
                name="shortCode"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value || ''}
                    label="Short Code"
                    error={!!errors.shortCode}
                    helperText={errors.shortCode?.message}
                    required
                    placeholder="Enter short code (e.g. POL)"
                  />
                )}
              />

              {/* CCTNS Department Code */}
              <Controller
                name="cctnsDepartmentCd"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value || ''}
                    label="CCTNS Department Code"
                    error={!!errors.cctnsDepartmentCd}
                    helperText={errors.cctnsDepartmentCd?.message}
                    placeholder="Enter CCTNS code"
                  />
                )}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => handleNavigate('/departments')}
              disabled={isSaving}
            />
            <Button
              type="submit"
              label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
              icon={isSaving ? 'pi pi-spin pi-spinner' : undefined}
              disabled={isSaving}
            />
          </div>
        </form>
      </div>

      {/* Leave confirmation */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="DepartmentForm.Dialog.Leave"
      />
    </PermissionGuard>
  );
};

export default DepartmentForm;
