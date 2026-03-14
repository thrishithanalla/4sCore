/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Toast } from 'mainFe/Toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import FormInput from '../../components/forms/form-input';
import FormSelect from '../../components/forms/form-select';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import { mandalsService } from '../../services/mandals.service';
import { masterService } from '../../services/master.service';
import { extractErrorMessage } from '../../utils/error-handler';

/**
 * Validation Schema - Zod
 * mandalName must be letters only (including spaces)
 */
const mandalSchema = z.object({
  mandalName: z
    .string()
    .min(2, 'Mandal name must be at least 2 characters')
    .max(120, 'Mandal name must not exceed 120 characters')
    .regex(/^[a-zA-Z\s]+$/, 'Mandal name must contain only letters')
    .trim(),

  mandalCode: z
    .string()
    .max(20, 'Mandal code must not exceed 20 characters')
    .optional()
    .or(z.literal('')),

  districtId: z
    .string()
    .min(1, 'District is required'),
});

type MandalFormData = z.infer<typeof mandalSchema>;

const MandalForm = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'mandals',
    basePath: '/mandals',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  const DRAFT_KEY = `mandal-form-draft-${id || 'create'}`;

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
  } = useForm<MandalFormData>({
    resolver: zodResolver(mandalSchema) as any,
    defaultValues: {
      mandalName: '',
      mandalCode: '',
      districtId: '',
    },
    mode: 'onChange',
  });

  const formValues = watch();

  // Navigation blocker for unsaved changes
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Fetch districts once using react-query - memoized options
  const { data: districts = [] } = useQuery({
    queryKey: ['districts', 'dropdown'],
    queryFn: masterService.getDistricts,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Memoize district options for dropdown
  const districtOptions = useMemo(
    () => districts.map(d => ({ value: d._id, label: d.name })),
    [districts]
  );

  // Fetch mandal data for edit mode
  const { data: mandalData, isLoading: mandalLoading } = useQuery({
    queryKey: ['mandal', id],
    queryFn: () => mandalsService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show mandal name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? mandalData?.mandalName : null);

  // Populate form in edit mode
  useEffect(() => {
    if (mandalData && isEditMode) {
      console.log('Loading mandal data:', mandalData);

      reset({
        mandalName: mandalData.mandalName || '',
        mandalCode: (mandalData as any).mandalCode || '',
        districtId: mandalData.districtId || '',
      });
    }
  }, [mandalData, isEditMode, reset]);

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (isEditMode && id) {
        return mandalsService.update(id, data);
      }
      return mandalsService.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mandals'] });
      localStorage.removeItem(DRAFT_KEY);

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Mandal ${isEditMode ? 'updated' : 'created'} successfully`,
        life: 3000,
      });

      setTimeout(() => {
        navigateToList();
      }, 1000);
    },
    onError: (error: any) => {
      console.error('Error response:', error.response);
      const errorMessage = extractErrorMessage(error, `Failed to ${isEditMode ? 'update' : 'create'} mandal`);
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
  const onSubmit = async (data: MandalFormData) => {
    console.log('Form data:', data);

    const payload: any = {
      mandalName: data.mandalName,
      districtId: data.districtId,
    };

    // Only include mandalCode if provided
    if (data.mandalCode?.trim()) {
      payload.mandalCode = data.mandalCode.trim();
    }

    console.log('Final payload:', JSON.stringify(payload, null, 2));

    try {
      await mutation.mutateAsync(payload);
    } catch {
      console.log('Error caught and handled by onError callback');
    }
  };


  if (mandalLoading) {
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

      <div className="p-3" data-testid="SCR-Mandal-Form">
        {/* Main Card Container */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-4">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleNavigate('/mandals')}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
              >
                <i className="pi pi-arrow-left text-lg" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {isEditMode ? 'Edit Mandal' : 'Create New Mandal'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isEditMode ? 'Update mandal information' : 'Add a new mandal to the system'}
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
                onClick={() => handleNavigate('/mandals')}
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

          {/* Draft Recovery Banner */}
          {showDraftBanner && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 rounded mb-3">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <i className="pi pi-exclamation-circle text-blue-600 dark:text-blue-400" style={{ fontSize: '1rem' }} />
                  <span className="text-sm text-blue-800 dark:text-blue-200">You have unsaved changes from a previous session. Would you like to restore them?</span>
                </div>
                <div className="flex gap-2">
                  <Button label="Restore" size="small" severity="info" onClick={handleRestoreDraft} />
                  <Button label="Discard" size="small" severity="secondary" outlined onClick={handleDiscardDraft} />
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={(e) => {
              console.log('Form submit event triggered');
              handleSubmit(onSubmit as any)(e);
            }}
            noValidate
          >
            {/* Mandal Information */}
            <div className="border border-gray-200 dark:border-gray-700 rounded p-3">
              <h3 className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">
                Mandal Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Controller
                  name="mandalName"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      label="Mandal Name"
                      required
                      error={!!errors.mandalName}
                      helperText={errors.mandalName?.message}
                      autoFocus
                    />
                  )}
                />

                <Controller
                  name="mandalCode"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      label="Mandal Code"
                      error={!!errors.mandalCode}
                      helperText={errors.mandalCode?.message}
                    />
                  )}
                />

                <Controller
                  name="districtId"
                  control={control}
                  render={({ field: { value, onChange, ...field } }) => (
                    <FormSelect
                      {...field}
                      value={value ?? ''}
                      onChange={(e) => onChange(e.target.value)}
                      label="District"
                      options={districtOptions}
                      required
                      filter
                      filterPlaceholder="Search district..."
                      error={!!errors.districtId}
                      helperText={errors.districtId?.message}
                      appendTo="self"
                    />
                  )}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Leave Confirmation Dialog */}
        <DiscardChangesDialog
          visible={showLeaveDialog}
          onStay={cancelLeave}
          onLeave={confirmLeave}
          testId="MandalForm.Dialog.Leave"
        />
      </div>
    </>
  );
};

export default MandalForm;
