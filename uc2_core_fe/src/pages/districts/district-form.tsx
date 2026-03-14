/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Message } from 'primereact/message';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { Skeleton } from 'mainFe/Skeleton';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import FormInput from '../../components/forms/form-input';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import { districtsService } from '../../services/districts.service';
import { extractErrorMessage } from '../../utils/error-handler';

/**
 * Validation Schema - Zod
 */
const districtSchema = z.object({
  name: z
    .string()
    .min(2, 'District name must be at least 2 characters')
    .max(120, 'District name must not exceed 120 characters')
    .trim(),

  shortCode: z
    .string()
    .min(1, 'Short Code is required')
    .max(20, 'Short Code must not exceed 20 characters')
    .trim(),

  cctnsDistrictCd: z
    .string()
    .min(1, 'CCTNS District Code is required')
    .max(50, 'CCTNS District Code must not exceed 50 characters')
    .trim(),

  stateName: z
    .string()
    .max(100, 'State name must not exceed 100 characters')
    .trim()
    .optional()
    .or(z.literal('')),
});

type DistrictFormData = z.infer<typeof districtSchema>;

const DistrictForm = () => {
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'districts',
    basePath: '/districts',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.DISTRICTS);
  const canUpdate = useCanUpdate(JOB_NAMES.DISTRICTS);
  const hasPermission = isEditMode ? canUpdate : canCreate;

  const DRAFT_KEY = `district-form-draft-${id || 'create'}`;

  // State
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);

  // Form setup
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<DistrictFormData>({
    resolver: zodResolver(districtSchema) as any,
    defaultValues: {
      name: '',
      shortCode: '',
      cctnsDistrictCd: '',
      stateName: 'Andhra Pradesh',
    },
    mode: 'onChange',
  });

  const formValues = watch();

  // Navigation blocker for unsaved changes
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Fetch district data for edit mode
  const { data: districtData, isLoading: districtLoading } = useQuery({
    queryKey: ['district', id],
    queryFn: () => districtsService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show district name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? districtData?.name : null);

  // Populate form in edit mode
  useEffect(() => {
    if (districtData && isEditMode) {
      reset({
        name: districtData.name || '',
        shortCode: (districtData as any).shortCode || '',
        cctnsDistrictCd: districtData.cctnsDistrictCd || '',
        stateName: 'Andhra Pradesh',
      });
    }
  }, [districtData, isEditMode, reset]);

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (isEditMode && id) {
        return districtsService.update(id, data);
      }
      return districtsService.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['districts'] });
      localStorage.removeItem(DRAFT_KEY);

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `District ${isEditMode ? 'updated' : 'created'} successfully`,
        life: 3000,
      });

      setTimeout(() => {
        navigateToList();
      }, 1000);
    },
    onError: (error: any) => {
      console.error('Error response:', error.response);

      const errorMessage = extractErrorMessage(
        error,
        `Failed to ${isEditMode ? 'update' : 'create'} district`
      );

      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 10000,
      });
    },
  });

  // Autosave draft
  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(formValues));
    }, 1500);

    return () => clearTimeout(timer);
  }, [formValues, isDirty, DRAFT_KEY]);

  // Load draft on mount
  useEffect(() => {
    if (!isEditMode) {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          setDraftData(parsed);
          setShowDraftBanner(true);
        } catch {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    }
  }, [isEditMode, DRAFT_KEY]);

  // Handle draft restore
  const handleRestoreDraft = () => {
    if (draftData) {
      reset(draftData);
      setShowDraftBanner(false);
    }
  };

  // Handle draft discard
  const handleDiscardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setShowDraftBanner(false);
    setDraftData(null);
  };

  // Combined loading state for button disable
  const isSaving = mutation.isPending;

  // Form submission
  const onSubmit = async (data: DistrictFormData) => {
    const payload = {
      name: data.name,
      shortCode: data.shortCode,
      cctnsDistrictCd: data.cctnsDistrictCd,
      stateName: data.stateName || undefined,
    };

    try {
      await mutation.mutateAsync(payload);
    } catch {
      // Error handled by onError callback
    }
  };

  // Loading state
  if (districtLoading) {
    return (
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900 min-h-screen" data-testid="SCR-District-Form">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton width="40px" height="40px" borderRadius="8px" />
            <div>
              <Skeleton width="200px" height="24px" />
              <Skeleton width="150px" height="16px" className="mt-1" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton width="80px" height="36px" borderRadius="6px" />
            <Skeleton width="80px" height="36px" borderRadius="6px" />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <Skeleton width="180px" height="20px" className="mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton height="60px" />
            <Skeleton height="60px" />
            <Skeleton height="60px" />
            <Skeleton height="60px" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.DISTRICTS}>
      <Toast ref={toast} position="top-right" />

      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900 min-h-screen" data-testid="SCR-District-Form">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleNavigate('/districts')}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
          >
            <i className="pi pi-arrow-left text-lg" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {isEditMode ? 'Edit District' : 'Create New District'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isEditMode ? 'Update district information' : 'Add a new district to the system'}
            </p>
          </div>
        </div>

        {/* Draft Recovery Banner */}
        {showDraftBanner && (
          <div className="mb-4">
            <Message
              severity="info"
              className="w-full"
              content={
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <i className="pi pi-exclamation-circle" style={{ fontSize: '1.125rem' }} />
                    <span>You have unsaved changes from a previous session. Would you like to restore them?</span>
                  </div>
                  <div className="flex gap-2">
                    <Button label="Restore" size="small" severity="info" onClick={handleRestoreDraft} />
                    <Button label="Discard" size="small" severity="secondary" outlined onClick={handleDiscardDraft} />
                  </div>
                </div>
              }
            />
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit as any)} noValidate>
          {/* District Information */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <i className="pi pi-info-circle text-blue-600" style={{ fontSize: '1rem' }} />
                District Information
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    label="District Name"
                    required
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    autoFocus
                  />
                )}
              />

              <Controller
                name="shortCode"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    label="Short Code"
                    required
                    error={!!errors.shortCode}
                    helperText={errors.shortCode?.message}
                  />
                )}
              />

              <Controller
                name="cctnsDistrictCd"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    label="CCTNS District Code"
                    required
                    error={!!errors.cctnsDistrictCd}
                    helperText={errors.cctnsDistrictCd?.message}
                  />
                )}
              />

              <Controller
                name="stateName"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value || 'Andhra Pradesh'}
                    label="State Name"
                    disabled
                    error={!!errors.stateName}
                    helperText={errors.stateName?.message}
                  />
                )}
              />
            </div>

            {/* Form Actions */}
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 rounded-b-lg">
              <Button
                label="Cancel"
                severity="secondary"
                outlined
                onClick={() => handleNavigate('/districts')}
                disabled={isSaving}
                size="small"
              />
              <Button
                type="button"
                label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
                icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
                disabled={isSaving}
                onClick={handleSubmit(onSubmit as any)}
                size="small"
                testId="DistrictForm.Button.Submit"
              />
            </div>
          </div>
        </form>

        {/* Leave Confirmation Dialog */}
        <DiscardChangesDialog
          visible={showLeaveDialog}
          onStay={cancelLeave}
          onLeave={confirmLeave}
          testId="DistrictForm.Dialog.Leave"
        />
      </div>
    </PermissionGuard>
  );
};

export default DistrictForm;
