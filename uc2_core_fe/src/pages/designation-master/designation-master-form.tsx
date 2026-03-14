/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { Toast } from 'mainFe/Toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import { InputText } from 'primereact/inputtext';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';

import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { designationMasterService } from '../../services/designation-master.service';

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

// -----------------------------------------------------------------------------
// Zod Schema
// -----------------------------------------------------------------------------

const designationMasterSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(200, 'Must be <= 200 characters')
    .trim(),
  designationCode: z
    .string()
    .min(1, 'Designation Code is required')
    .max(200, 'Must be <= 200 characters')
    .regex(/^[a-zA-Z0-9]+$/, 'Only alphanumeric characters allowed')
    .trim(),
});

export type DesignationMasterFormData = z.infer<typeof designationMasterSchema>;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const DesignationMasterForm = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'designation-master',
    basePath: '/designation-master',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.DESIGNATION_MASTER);
  const canUpdate = useCanUpdate(JOB_NAMES.DESIGNATION_MASTER);
  const hasPermission = isEditMode ? canUpdate : canCreate;

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: existing, isLoading: fetchLoading } = useQuery({
    queryKey: ['designation-master', id],
    queryFn: () => designationMasterService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show designation name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? existing?.name : null);

  // ---------------------------------------------------------------------------
  // Form Setup
  // ---------------------------------------------------------------------------

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<DesignationMasterFormData>({
    resolver: zodResolver(designationMasterSchema) as Resolver<DesignationMasterFormData>,
    defaultValues: {
      name: '',
      designationCode: '',
    },
    mode: 'onChange',
  });

  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({
    when: isDirty,
  });

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Populate form in edit mode
  useEffect(() => {
    if (existing && isEditMode) {
      reset({
        name: existing.name || '',
        designationCode: existing.designationCode || '',
      });
    }
  }, [existing, isEditMode, reset]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const createMut = useMutation({
    mutationFn: (payload: any) => designationMasterService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designation-master'] });
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Designation created successfully',
        life: 3000,
      });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to create designation',
        life: 10000,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => designationMasterService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designation-master'] });
      queryClient.invalidateQueries({ queryKey: ['designation-master', id] });
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Designation updated successfully',
        life: 3000,
      });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to update designation',
        life: 10000,
      });
    },
  });

  // Combined loading state for button disable
  const isSaving = createMut.isPending || updateMut.isPending;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const onSubmit = (data: DesignationMasterFormData) => {
    const payload = {
      name: data.name,
      designationCode: data.designationCode,
    };

    if (isEditMode) {
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
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900 flex justify-center items-center">
        <ProgressSpinner style={{ width: '50px', height: '50px' }} />
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.DESIGNATION_MASTER}>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900" data-testid={isEditMode ? 'SCR-DesignationMaster-Edit' : 'SCR-DesignationMaster-Create'}>
        {/* Header - Compact */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleNavigate('/designation-master')}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
            >
              <i className="pi pi-arrow-left text-lg" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Designation' : 'Create New Designation'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditMode ? 'Update designation configuration' : 'Add a new designation for the organization'}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            {/* Section: Designation Information */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <i className="pi pi-id-card" />
                Designation Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Name */}
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <InputText
                        id="name"
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        placeholder="Enter designation name (e.g., Manager, Developer)"
                        className={`w-full ${errors.name ? 'p-invalid' : ''}`}
                      />
                      {errors.name && (
                        <small className="text-red-500">{errors.name.message}</small>
                      )}
                    </div>
                  )}
                />

                {/* Designation Code */}
                <Controller
                  name="designationCode"
                  control={control}
                  render={({ field }) => (
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Designation Code <span className="text-red-500">*</span>
                      </label>
                      <InputText
                        id="designationCode"
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        placeholder="Enter designation code (e.g., MGR, DEV)"
                        className={`w-full ${errors.designationCode ? 'p-invalid' : ''}`}
                      />
                      {errors.designationCode && (
                        <small className="text-red-500">{errors.designationCode.message}</small>
                      )}
                    </div>
                  )}
                />
              </div>
            </div>

            {/* Section: Form Actions */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  label="Cancel"
                  severity="secondary"
                  outlined
                  onClick={() => handleNavigate('/designation-master')}
                  disabled={isSaving}
                />
                <Button
                  type="submit"
                  label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
                  icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Leave confirmation */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="DesignationMasterForm.Dialog.Leave"
      />
    </PermissionGuard>
  );
};

export default DesignationMasterForm;
