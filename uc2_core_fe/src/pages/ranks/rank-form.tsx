/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
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

import { ranksService } from '../../services/ranks.service';

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

const rankSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Must be ≤ 120 characters').trim(),
  cctnsRankCd: z.number({ required_error: 'CCTNS Rank Code is required', invalid_type_error: 'CCTNS Rank Code must be a number' }).min(0, 'CCTNS Rank Code must be at least 0'),
  shortCode: z.string().min(1, 'Short Code is required').max(20, 'Must be ≤ 20 characters').trim(),
  level: z.number({ required_error: 'Level is required', invalid_type_error: 'Level must be a number' }).min(1, 'Level must be at least 1'),
});

export type RankFormData = z.infer<typeof rankSchema>;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const RankForm = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'rank',
    basePath: '/rank',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<RankFormData>({
    resolver: zodResolver(rankSchema) as Resolver<RankFormData>,
    defaultValues: {
      name: '',
      cctnsRankCd: 0,
      shortCode: '',
      level: 1,
    },
    mode: 'onChange',
  });

  // Navigation blocker for unsaved changes
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Fetch existing entity when editing
  const { data: existing, isLoading: fetchLoading } = useQuery({
    queryKey: ['ranks', id],
    queryFn: async () => await ranksService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show rank name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? existing?.name : null);

  useEffect(() => {
    if (existing && isEditMode) {
      reset({
        name: existing.name,
        cctnsRankCd: existing.cctnsRankCd ?? 0,
        shortCode: existing.shortCode || '',
        level: existing.level ?? 1,
      });
    }
  }, [existing, isEditMode, reset]);

  // Mutations
  const createMut = useMutation({
    mutationFn: (payload: any) => ranksService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ranks'] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Rank created successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to save Rank',
        life: 10000,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => ranksService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ranks'] });
      queryClient.invalidateQueries({ queryKey: ['ranks', id] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Rank updated successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to save Rank',
        life: 10000,
      });
    },
  });

  // Combined loading state for button disable
  const isSaving = createMut.isPending || updateMut.isPending;

  // Submit
  const onSubmit = (data: RankFormData) => {
    const payload = {
      name: data.name,
      cctnsRankCd: data.cctnsRankCd,
      shortCode: data.shortCode,
      level: data.level,
    };

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
    <>
      <Toast ref={toast} position="top-right" />

      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900" data-testid="SCR-Rank-Form">
        {/* Header - Compact */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleNavigate('/rank')}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
            >
              <i className="pi pi-arrow-left text-lg" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Rank' : 'Create Rank'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditMode ? 'Update rank information' : 'Add a new rank'}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Rank Information
            </h2>
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
                    onChange={field.onChange as (e: React.ChangeEvent<HTMLInputElement>) => void}
                    error={!!errors.name}
                    helperText={errors.name?.message as string}
                    required
                    placeholder="Enter rank name"
                  />
                )}
              />

              {/* CCTNS Rank Code */}
              <Controller
                name="cctnsRankCd"
                control={control}
                render={({ field }) => (
                  <FormInput
                    name={field.name}
                    label="CCTNS Rank Code"
                    type="number"
                    value={field.value?.toString() ?? '0'}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value;
                      field.onChange(val === '' ? 0 : parseInt(val, 10));
                    }}
                    error={!!errors.cctnsRankCd}
                    helperText={errors.cctnsRankCd?.message as string}
                    required
                    placeholder="Enter CCTNS code (0-999999)"
                    min="0"
                    max="999999"
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
                    onChange={field.onChange as (e: React.ChangeEvent<HTMLInputElement>) => void}
                    error={!!errors.shortCode}
                    helperText={errors.shortCode?.message as string}
                    required
                    placeholder="Enter short code"
                  />
                )}
              />

              {/* Level */}
              <Controller
                name="level"
                control={control}
                render={({ field }) => (
                  <FormInput
                    name={field.name}
                    label="Level"
                    type="number"
                    value={field.value?.toString() ?? '1'}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value;
                      field.onChange(val === '' ? 1 : parseInt(val, 10));
                    }}
                    error={!!errors.level}
                    helperText={errors.level?.message as string}
                    required
                    placeholder="Enter level (1-100)"
                    min="1"
                    max="100"
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
              onClick={() => handleNavigate('/rank')}
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
        testId="RankForm.Dialog.Leave"
      />
    </>
  );
};

export default RankForm;
