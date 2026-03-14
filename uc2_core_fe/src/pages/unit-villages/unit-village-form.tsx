/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Toast } from 'mainFe/Toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';

import FormInput from '../../components/forms/form-input';
import FormSelect from '../../components/forms/form-select';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import { unitVillagesService } from '../../services/unit-villages.service';
import { masterService } from '../../services/master.service';
import { mandalsService } from '../../services/mandals.service';
import { unitsService } from '../../services/units.service';
import { extractErrorMessage } from '../../utils/error-handler';

// Zod Validation Schema
const unitVillageSchema = z.object({
  unitId: z.string().min(1, 'Police Unit is required'),
  villageName: z
    .string()
    .min(2, 'Village name must be at least 2 characters')
    .max(100, 'Village name must not exceed 100 characters')
    .trim(),
  villageCode: z.string().max(50, 'Village code must not exceed 50 characters').trim().optional().or(z.literal('')),
  mandalId: z.string().min(1, 'Mandal is required'),
});

type UnitVillageFormData = z.infer<typeof unitVillageSchema>;

const UnitVillageForm = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'unit-villages',
    basePath: '/unit-villages',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  const DRAFT_KEY = `unit-village-draft-${isEditMode ? id : 'new'}`;

  // Draft state
  const [draftData, setDraftData] = useState<UnitVillageFormData | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  // React Hook Form
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<UnitVillageFormData>({
    resolver: zodResolver(unitVillageSchema),
    defaultValues: {
      unitId: '',
      villageName: '',
      villageCode: '',
      mandalId: '',
    },
    mode: 'onChange',
  });

  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  const formValues = watch();
  const selectedUnitId = watch('unitId');

  // Fetch units with full data (includes districtId)
  const { data: units = [] } = useQuery({
    queryKey: ['units', 'dropdown'],
    queryFn: unitsService.getAllForDropdown,
  });

  // Get the selected unit's districtId
  const selectedUnit = useMemo(
    () => units.find((u) => u._id === selectedUnitId),
    [units, selectedUnitId]
  );
  const selectedDistrictId = selectedUnit?.districtId;

  // Fetch mandals filtered by the selected unit's districtId
  const { data: mandals = [], isLoading: mandalsLoading } = useQuery({
    queryKey: ['mandals', 'dropdown', selectedDistrictId],
    queryFn: () => mandalsService.getAllForDropdown(selectedDistrictId),
    enabled: !!selectedDistrictId,
  });

  // Reset mandalId when unit changes (only in create mode or when user changes unit)
  const previousUnitIdRef = useRef<string | null>(null);
  useEffect(() => {
    // Skip reset on initial load in edit mode
    if (previousUnitIdRef.current !== null && previousUnitIdRef.current !== selectedUnitId) {
      setValue('mandalId', '', { shouldValidate: false });
    }
    previousUnitIdRef.current = selectedUnitId;
  }, [selectedUnitId, setValue]);

  // Fetch unit village data for edit mode - wait for ID decryption
  const { data: unitVillage, isLoading: fetchLoading } = useQuery({
    queryKey: ['unit-villages', id],
    queryFn: () => unitVillagesService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show village name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? unitVillage?.villageName : null);

  // Populate form when unit village data is loaded
  useEffect(() => {
    if (unitVillage && isEditMode) {
      console.log('Unit Village Data:', unitVillage);
      console.log('unitId:', unitVillage.unitId, 'unit?._id:', unitVillage.unit?._id);
      console.log('mandalId:', unitVillage.mandalId, 'mandal?._id:', unitVillage.mandal?._id);

      const formData = {
        unitId: unitVillage.unitId || unitVillage.unit?._id || '',
        villageName: unitVillage.villageName || '',
        villageCode: unitVillage.villageCode || '',
        mandalId: unitVillage.mandalId || unitVillage.mandal?._id || '',
      };
      console.log('Form data to reset:', formData);
      reset(formData);
    }
  }, [unitVillage, isEditMode, reset]);

  // Draft autosave (only for create mode)
  useEffect(() => {
    if (isEditMode || !isDirty) return;

    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(formValues));
    }, 1500);

    return () => clearTimeout(timer);
  }, [formValues, isDirty, isEditMode, DRAFT_KEY]);

  // Load draft on mount (only for create mode)
  useEffect(() => {
    if (!isEditMode) {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          setDraftData(parsed);
          setShowDraftBanner(true);
        } catch (error) {
          console.error('Failed to parse draft:', error);
        }
      }
    }
  }, [isEditMode, DRAFT_KEY]);

  // Mutation for create/update
  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (isEditMode && id) {
        return unitVillagesService.update(id, data);
      }
      return unitVillagesService.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit-villages'] });
      localStorage.removeItem(DRAFT_KEY);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Unit Village Mapping ${isEditMode ? 'updated' : 'created'} successfully`,
        life: 3000,
      });
      setTimeout(() => {
        navigateToList();
      }, 1000);
    },
    onError: (error: any) => {
      console.error('Error response:', error.response);
      const errorMessage = extractErrorMessage(error, `Failed to ${isEditMode ? 'update' : 'create'} mapping`);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 10000,
      });
    },
  });

  // Combined loading state for button disable
  const isSaving = mutation.isPending;

  const onSubmit = (data: UnitVillageFormData) => {
    // Note: createdBy/updatedBy are handled by backend from JWT token
    console.log('Submitting unit village payload:', data);
    mutation.mutate(data);
  };

  const handleRestoreDraft = () => {
    if (draftData) {
      reset(draftData);
      setShowDraftBanner(false);
    }
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftData(null);
    setShowDraftBanner(false);
  };

  // Dropdown options
  const unitOptions = useMemo(
    () => units.map((u) => ({ value: u._id, label: u.name || u.policeReferenceId || u._id })),
    [units]
  );

  const mandalOptions = useMemo(
    () => mandals.map((m) => {
      const name = m.mandalName || m._id;
      // Capitalize first letter of each word
      const capitalizedName = name
        .toLowerCase()
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return { value: m._id, label: capitalizedName };
    }),
    [mandals]
  );

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
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900">
        {/* Header Section */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => handleNavigate('/unit-villages')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
          >
            <i className="pi pi-arrow-left" style={{ fontSize: '1.25rem' }} />
            <span>Back to Unit Villages</span>
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {isEditMode ? 'Edit Unit Village Mapping' : 'Create New Unit Village Mapping'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isEditMode
              ? 'Update unit village mapping information'
              : 'Add a new village-to-unit mapping'}
          </p>
        </div>

        {/* Draft Recovery Banner */}
        {showDraftBanner && (
          <div className="mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <i className="pi pi-info-circle text-blue-600" />
              <span className="text-blue-800 dark:text-blue-200">
                Unsaved changes found. Restore them?
              </span>
            </div>
            <div className="flex gap-2">
              <Button label="Restore" size="small" onClick={handleRestoreDraft} />
              <Button label="Discard" size="small" severity="secondary" text onClick={handleDiscardDraft} />
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Mapping Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Controller
                name="unitId"
                control={control}
                render={({ field: { value, onChange, ...field } }) => (
                  <FormSelect
                    {...field}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    label="Police Unit"
                    options={unitOptions}
                    placeholder="Select a police unit"
                    error={!!errors.unitId}
                    helperText={errors.unitId?.message as string}
                    required
                    filter
                    filterPlaceholder="Search units..."
                  />
                )}
              />

              <Controller
                name="villageName"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    label="Village Name"
                    placeholder="Enter village name"
                    error={!!errors.villageName}
                    helperText={errors.villageName?.message as string}
                    required
                  />
                )}
              />

              <Controller
                name="villageCode"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value || ''}
                    label="Village Code"
                    placeholder="Enter village code"
                    error={!!errors.villageCode}
                    helperText={errors.villageCode?.message as string}
                  />
                )}
              />

              <Controller
                name="mandalId"
                control={control}
                render={({ field: { value, onChange, ...field } }) => (
                  <FormSelect
                    {...field}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    label="Mandal"
                    options={mandalOptions}
                    placeholder={!selectedUnitId ? 'Select a unit first' : mandalsLoading ? 'Loading mandals...' : 'Select a mandal'}
                    error={!!errors.mandalId}
                    helperText={errors.mandalId?.message as string}
                    required
                    disabled={!selectedUnitId || mandalsLoading}
                    filter
                    filterPlaceholder="Search mandals..."
                  />
                )}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => handleNavigate('/unit-villages')}
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

      {/* Leave Confirmation Dialog */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="UnitVillageForm.Dialog.Leave"
      />
    </>
  );
};

export default UnitVillageForm;
