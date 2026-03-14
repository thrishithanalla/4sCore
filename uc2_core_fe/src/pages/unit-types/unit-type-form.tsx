/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
import { LoadingSpinner } from 'mainFe/LoadingSpinner';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';

import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import FormInput from '../../components/forms/form-input';
import FormSearchableSelect from '../../components/forms/form-searchable-select';
import { unitTypesService } from '../../services/unit-types.service';
import { masterService } from '../../services/master.service';
import type { Department } from '../../types';

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

const unitTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Must be ≤ 120 characters').trim(),
  shortCode: z.string().max(50, 'Must be ≤ 50 characters').trim().optional().or(z.literal('')),
  scope: z.string().max(200, 'Must be ≤ 200 characters').trim().optional().or(z.literal('')),
  departmentId: z.string().min(1, 'Department is required'),
  level: z.coerce.number({ message: 'Level is required' }).int('Level must be an integer').min(0, 'Level must be 0 or greater'),
});

export type UnitTypeFormData = z.infer<typeof unitTypeSchema>;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const UnitTypeForm = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'unit-types',
    basePath: '/unit-types',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  // Fetch departments for dropdown
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: masterService.getDepartments,
  });

  // Transform departments to options for FormSearchableSelect
  const departmentOptions = departments.map((d: Department) => ({
    value: d._id,
    label: d.name,
  }));

  // Search handler for departments
  const handleDepartmentSearch = async (searchTerm: string) => {
    try {
      const allDepartments = await masterService.getDepartments();
      const filtered = allDepartments.filter((d: Department) =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      return filtered.map((d: Department) => ({
        value: d._id,
        label: d.name,
      }));
    } catch (error) {
      console.error('Error searching departments:', error);
      return [];
    }
  };

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UnitTypeFormData>({
    resolver: zodResolver(unitTypeSchema) as Resolver<UnitTypeFormData>,
    defaultValues: {
      name: '',
      shortCode: '',
      scope: '',
      departmentId: '',
      level: undefined,
    },
    mode: 'onChange',
  });

  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Fetch existing entity when editing
  const { data: existing, isLoading: fetchLoading } = useQuery({
    queryKey: ['unit-types', id],
    queryFn: async () => await unitTypesService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show unit type name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? existing?.name : null);

  useEffect(() => {
    if (existing && isEditMode) {
      console.log('Resetting form with existing data:', existing);
      reset({
        name: existing.name,
        shortCode: existing.shortCode || '',
        scope: existing.scope || '',
        departmentId: existing.departmentId || '',
        level: existing.level,
      });
    }
  }, [existing, isEditMode, reset]);

  // Mutations
  const createMut = useMutation({
    mutationFn: (payload: any) => unitTypesService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit-types'] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Unit Type created successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to save Unit Type',
        life: 10000,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => unitTypesService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit-types'] });
      queryClient.invalidateQueries({ queryKey: ['unit-types', id] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Unit Type updated successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to save Unit Type',
        life: 10000,
      });
    },
  });

  // Combined loading state for button disable
  const isSaving = createMut.isPending || updateMut.isPending;

  // Submit
  const onSubmit = (data: UnitTypeFormData) => {
    const payload = {
      name: data.name,
      shortCode: data.shortCode || undefined,
      scope: data.scope || undefined,
      departmentId: data.departmentId,
      level: data.level,
    };

    if (isEditMode) updateMut.mutate(payload);
    else createMut.mutate(payload);
  };

  // Loading state
  if (fetchLoading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />

      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900" data-testid="SCR-UnitType-Form">
        {/* Header - Compact */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleNavigate('/unit-types')}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
            >
              <i className="pi pi-arrow-left text-lg" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Unit Type' : 'Create Unit Type'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditMode ? 'Update unit type information' : 'Add a new unit type'}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Unit Type Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Name */}
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    label="Name"
                    required
                    placeholder="Enter unit type name"
                    error={!!errors.name}
                    helperText={errors.name?.message}
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
                    placeholder="Enter short code"
                    error={!!errors.shortCode}
                    helperText={errors.shortCode?.message}
                  />
                )}
              />

              {/* Scope */}
              <Controller
                name="scope"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value || ''}
                    label="Scope"
                    placeholder="Enter scope"
                    error={!!errors.scope}
                    helperText={errors.scope?.message}
                  />
                )}
              />

              {/* Level */}
              <Controller
                name="level"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    type="number"
                    value={field.value ?? ''}
                    label="Level"
                    placeholder="Enter level (number)"
                    error={!!errors.level}
                    helperText={errors.level?.message}
                    required
                  />
                )}
              />

              {/* Department - Searchable Dropdown */}
              <div className="md:col-span-2">
                <Controller
                  name="departmentId"
                  control={control}
                  render={({ field: { value, onChange, ...field } }) => (
                    <FormSearchableSelect
                      {...field}
                      value={value || ''}
                      onChange={(e) => onChange(e.target.value)}
                      label="Department"
                      required
                      onSearch={handleDepartmentSearch}
                      initialOptions={departmentOptions}
                      placeholder="Search and select department"
                      error={!!errors.departmentId}
                      helperText={errors.departmentId?.message}
                    />
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
              onClick={() => handleNavigate('/unit-types')}
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
        testId="UnitTypeForm.Dialog.Leave"
      />
    </>
  );
};

export default UnitTypeForm;
