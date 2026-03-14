/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
import { LoadingSpinner } from 'mainFe/LoadingSpinner';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { Checkbox } from 'mainFe/Checkbox';
import { TextArea } from 'mainFe/TextArea';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';

import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import FormInput from '../../components/forms/form-input';
import FormSelect from '../../components/forms/form-select';
import FormMultiSelect from '../../components/forms/form-multi-select';
import { postsService } from '../../services/posts.service';
import { ranksService } from '../../services/ranks.service';
import { unitsService } from '../../services/units.service';

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

const postSchema = z.object({
  postCode: z.string().min(1, 'Post code is required').max(50, 'Must be ≤ 50 characters').trim().toUpperCase(),
  postName: z.string().min(1, 'Post name is required').max(120, 'Must be ≤ 120 characters').trim(),
  unitId: z.string().min(1, 'Unit is required'),
  sanctionedCount: z.coerce.number().int('Must be an integer').min(1, 'Sanctioned count must be at least 1'),
  allowedRanks: z.array(z.string()).default([]),
  isUnitHead: z.boolean().default(false),
  reportsToPostId: z.string().optional().nullable(),
  description: z.string().max(500, 'Must be ≤ 500 characters').optional().or(z.literal('')),
});

export type PostFormData = z.infer<typeof postSchema>;

// -----------------------------------------------------------------------------
// Props Interface (for modal mode)
// -----------------------------------------------------------------------------

interface PostFormProps {
  /** When true, renders in modal-friendly mode (no back button, uses callbacks) */
  isModal?: boolean;
  /** Pre-selected unit ID (for modal mode) */
  modalUnitId?: string;
  /** Pre-selected unit name (for modal mode) */
  modalUnitName?: string;
  /** Callback when post is created successfully (for modal mode) */
  onSuccess?: () => void;
  /** Callback when user cancels (for modal mode) */
  onCancel?: () => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const PostForm = ({
  isModal = false,
  modalUnitId,
  modalUnitName,
  onSuccess,
  onCancel,
}: PostFormProps = {}) => {
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'posts',
    basePath: '/posts',
  });
  const isEditMode = Boolean(id) && !isModal; // In modal mode, we're always creating
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  // Get pre-selected unitId from URL query params (when coming from Units list kebab menu)
  // In modal mode, use modalUnitId/modalUnitName props instead
  const [searchParams] = useSearchParams();
  const preSelectedUnitId = isModal ? (modalUnitId || '') : (searchParams.get('unitId') || '');
  const preSelectedUnitName = isModal ? (modalUnitName || '') : (searchParams.get('unitName') || '');

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<PostFormData>({
    resolver: zodResolver(postSchema) as Resolver<PostFormData>,
    defaultValues: {
      postCode: '',
      postName: '',
      unitId: preSelectedUnitId,
      sanctionedCount: 1,
      allowedRanks: [],
      isUnitHead: false,
      reportsToPostId: null,
      description: '',
    },
    mode: 'onChange',
  });

  // Navigation blocker - disabled in modal mode since we handle it differently
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty && !isModal });

  // Watch unitId and isUnitHead to filter posts for reportsToPostId
  const selectedUnitId = watch('unitId');
  const isUnitHead = watch('isUnitHead');

  // Fetch existing entity when editing
  const { data: existing, isLoading: fetchLoading } = useQuery({
    queryKey: ['posts', id],
    queryFn: async () => await postsService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Fetch units for dropdown (with department info)
  const { data: units = [], isLoading: unitsLoading } = useQuery({
    queryKey: ['units', 'dropdown', 'full'],
    queryFn: unitsService.getAllForDropdown,
  });

  // Fetch ranks for multi-select
  const { data: ranks = [], isLoading: ranksLoading } = useQuery({
    queryKey: ['ranks', 'dropdown'],
    queryFn: ranksService.getAllForDropdown,
  });

  // Fetch posts for reportsToPostId dropdown (filtered by selected unit)
  const { data: postsForUnit = [], isLoading: postsForUnitLoading } = useQuery({
    queryKey: ['posts', 'dropdown', selectedUnitId],
    queryFn: () => postsService.getAllForDropdown(selectedUnitId),
    enabled: !!selectedUnitId && !isUnitHead,
  });

  // Fetch all posts for reportsToPostId dropdown (when isUnitHead is true - no unit filter)
  const { data: allPosts = [], isLoading: allPostsLoading } = useQuery({
    queryKey: ['posts', 'dropdown', 'all'],
    queryFn: () => postsService.getAllForDropdown(),
    enabled: isUnitHead === true,
  });

  // Use appropriate posts list based on isUnitHead
  const postsForDropdown = isUnitHead ? allPosts : postsForUnit;
  const postsLoading = isUnitHead ? allPostsLoading : postsForUnitLoading;

  // Transform options
  const unitOptions = useMemo(
    () => units.map((u: any) => ({ value: u._id, label: u.name })),
    [units]
  );

  // Get selected unit's department name for display
  const selectedUnitDepartmentName = useMemo(() => {
    if (!selectedUnitId) return null;
    const selectedUnit = units.find((u: any) => u._id === selectedUnitId);
    // department can be a string (name) or populated object with name property
    const dept = selectedUnit?.department;
    if (!dept) return null;
    return typeof dept === 'string' ? dept : dept.name || null;
  }, [selectedUnitId, units]);

  const rankOptions = useMemo(
    () => ranks.map((r: { _id: string; name: string; shortCode?: string }) => ({ value: r._id, label: `${r.name} (${r.shortCode || ''})` })),
    [ranks]
  );

  // Filter out current post from reportsTo options
  const reportsToOptions = useMemo(
    () => postsForDropdown
      .filter((p: { _id: string }) => p._id !== id)
      .map((p: { _id: string; postName: string; postCode: string; unitName?: string }) => ({
        value: p._id,
        label: isUnitHead && p.unitName ? `${p.postName} (${p.postCode}) - ${p.unitName}` : `${p.postName} (${p.postCode})`
      })),
    [postsForDropdown, id, isUnitHead]
  );

  // Set breadcrumb title
  useBreadcrumbTitle(isEditMode ? existing?.postName : null);

  useEffect(() => {
    if (existing && isEditMode) {
      console.log('Resetting form with existing data:', existing);
      reset({
        postCode: existing.postCode || '',
        postName: existing.postName || '',
        unitId: existing.unitId || '',
        sanctionedCount: existing.sanctioned ?? 1,
        allowedRanks: existing.allowedRanks || [],
        isUnitHead: existing.isUnitHead ?? false,
        reportsToPostId: existing.reportsToPostId || null,
        description: existing.description || '',
      });
    }
  }, [existing, isEditMode, reset]);

  // Auto-select unit head post as reporting post when isUnitHead is false
  useEffect(() => {
    // Only auto-select in create mode, not edit mode
    if (isEditMode) return;
    // Only when isUnitHead is false and we have posts loaded
    if (isUnitHead || !postsForUnit.length) return;

    // Find the unit head post in the current unit
    const unitHeadPost = postsForUnit.find((p: any) => p.isUnitHead === true && p._id !== id);

    if (unitHeadPost) {
      // Get current value to avoid unnecessary updates
      const currentReportsTo = watch('reportsToPostId');
      if (!currentReportsTo) {
        setValue('reportsToPostId', unitHeadPost._id, { shouldDirty: false });
      }
    }
  }, [postsForUnit, isUnitHead, isEditMode, id, setValue, watch]);

  // Mutations
  const createMut = useMutation({
    mutationFn: (payload: any) => postsService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Post created successfully', life: 3000 });
      if (isModal && onSuccess) {
        // In modal mode, call the onSuccess callback after a brief delay for toast visibility
        setTimeout(() => onSuccess(), 800);
      } else {
        setTimeout(() => navigateToList(), 800);
      }
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to save Post',
        life: 10000,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => postsService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts', id] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Post updated successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to save Post',
        life: 10000,
      });
    },
  });

  const isSaving = createMut.isPending || updateMut.isPending;
  const isLoading = fetchLoading || unitsLoading || ranksLoading;

  // Submit
  const onSubmit = async (data: PostFormData) => {
    const payload = {
      postCode: data.postCode,
      postName: data.postName,
      unitId: data.unitId,
      sanctionedCount: data.sanctionedCount,
      allowedRanks: data.allowedRanks,
      isUnitHead: data.isUnitHead,
      reportsToPostId: data.reportsToPostId || undefined,
      description: data.description || undefined,
    };

    if (isEditMode) updateMut.mutate(payload);
    else createMut.mutate(payload);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={isModal ? "py-4 flex justify-center items-center" : "py-8 px-6 flex justify-center items-center"}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />

      <div className={isModal ? "py-2" : "py-8 px-6"} data-testid="SCR-Post-Form">
        {/* Header - Hidden in modal mode since Dialog has its own header */}
        {!isModal && (
          <div className="mb-6">
            <button
              className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
              onClick={() => handleNavigate('/posts')}
            >
              <i className="pi pi-arrow-left" style={{ fontSize: '1.25rem' }} />
              Back to Posts
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {isEditMode ? 'Edit Post' : 'Create Post'}
            </h1>
            {!isEditMode && preSelectedUnitName && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Creating post for unit: <span className="font-medium">{decodeURIComponent(preSelectedUnitName)}</span>
              </p>
            )}
          </div>
        )}

        {/* Show unit name in modal mode */}
        {isModal && preSelectedUnitName && (
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Creating post for unit: <span className="font-medium">{decodeURIComponent(preSelectedUnitName)}</span>
          </p>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className={isModal ? "p-2 mb-4" : "bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6"}>
            {!isModal && (
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                Post Information
              </h2>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Unit */}
              <Controller
                name="unitId"
                control={control}
                render={({ field }) => (
                  <FormSelect
                    name={field.name}
                    label="Unit"
                    value={field.value ?? ''}
                    onChange={(e) => {
                      field.onChange(e);
                      // Clear reportsToPostId when unit changes
                      setValue('reportsToPostId', null, { shouldDirty: false });
                    }}
                    options={unitOptions}
                    required
                    placeholder="Select Unit"
                    error={!!errors.unitId}
                    helperText={errors.unitId?.message}
                  />
                )}
              />

              {/* Department (read-only display based on selected unit) */}
              <div className="relative">
                <div className={`flex items-center px-3 pt-5 pb-2 h-[56px] rounded-md border ${
                  selectedUnitDepartmentName
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                }`}>
                  <span className={`text-sm ${
                    selectedUnitDepartmentName
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400 italic'
                  }`}>
                    {selectedUnitDepartmentName || 'Select a unit to see department'}
                  </span>
                </div>
                <label className={`absolute left-3 top-1.5 text-xs font-medium ${
                  selectedUnitDepartmentName
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400'
                }`}>
                  Department
                </label>
              </div>

              {/* Post Code */}
              <Controller
                name="postCode"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value ?? ''}
                    label="Post Code"
                    required
                    placeholder="SI, ASI, HC, etc."
                    error={!!errors.postCode}
                    helperText={errors.postCode?.message}
                  />
                )}
              />

              {/* Post Name */}
              <Controller
                name="postName"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value ?? ''}
                    label="Post Name"
                    required
                    placeholder="Sub-Inspector, Head Constable, etc."
                    error={!!errors.postName}
                    helperText={errors.postName?.message}
                  />
                )}
              />

              {/* No of Positions (Sanctioned Count) */}
              <Controller
                name="sanctionedCount"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    type="number"
                    value={field.value ?? 1}
                    label="No of Positions"
                    required
                    placeholder="Number of positions"
                    error={!!errors.sanctionedCount}
                    helperText={errors.sanctionedCount?.message || `Sanctioned count - ${isEditMode ? 'Changing this will adjust positions automatically' : 'Positions will be auto-generated'}`}
                  />
                )}
              />

              {/* Is Unit Head - Checkbox */}
              <div className="flex items-center">
                <Controller
                  name="isUnitHead"
                  control={control}
                  render={({ field: { value, onChange } }) => (
                    <Checkbox
                      inputId="isUnitHead"
                      checked={value || false}
                      onChange={(e: { checked: boolean }) => onChange(e.checked)}
                      label="Is Unit Head"
                    />
                  )}
                />
              </div>

              {/* Reporting Post */}
              <Controller
                name="reportsToPostId"
                control={control}
                render={({ field }) => (
                  <FormSelect
                    name={field.name}
                    label="Reporting Post"
                    value={field.value || ''}
                    onChange={(e) => field.onChange(e.target.value || null)}
                    options={reportsToOptions}
                    placeholder={isUnitHead ? 'Select reporting post (optional)' : (selectedUnitId ? 'Select reporting post (optional)' : 'Select unit first')}
                    disabled={(!selectedUnitId && !isUnitHead) || postsLoading}
                    filter
                    filterPlaceholder="Search posts..."
                    showClear
                    error={!!errors.reportsToPostId}
                    helperText={errors.reportsToPostId?.message || (isUnitHead ? 'Showing all posts (unit head can report to any post)' : undefined)}
                  />
                )}
              />

              {/* Allowed Ranks - Multi-select */}
              <Controller
                name="allowedRanks"
                control={control}
                render={({ field }) => (
                  <FormMultiSelect
                    name={field.name}
                    label="Allowed Ranks"
                    value={field.value ?? []}
                    onChange={field.onChange}
                    options={rankOptions}
                    placeholder="Select ranks that can fill this post"
                    error={!!errors.allowedRanks}
                    helperText={errors.allowedRanks?.message}
                    loading={ranksLoading}
                    display="chip"
                    maxSelectedLabels={3}
                  />
                )}
              />

              {/* Description */}
              <div className="md:col-span-2">
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <TextArea
                      value={field.value ?? ''}
                      onChange={(value: string) => field.onChange(value)}
                      label="Description"
                      placeholder="Brief description of this post"
                      rows={3}
                      style={{ width: '100%' }}
                    />
                  )}
                />
                {errors.description && (
                  <small className="text-red-500 text-xs mt-1">{errors.description.message}</small>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => {
                if (isModal && onCancel) {
                  onCancel();
                } else {
                  handleNavigate('/posts');
                }
              }}
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

      {/* Leave confirmation - not shown in modal mode */}
      {!isModal && (
        <DiscardChangesDialog
          visible={showLeaveDialog}
          onStay={cancelLeave}
          onLeave={confirmLeave}
          testId="PostForm.Dialog.Leave"
        />
      )}
    </>
  );
};

export default PostForm;
