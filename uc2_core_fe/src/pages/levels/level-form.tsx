/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
import { LoadingSpinner } from 'mainFe/LoadingSpinner';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { ProgressBar } from 'mainFe/ProgressBar';
import { uploadFile, getDownloadUrl } from 'mainFe/fileUploadService';
import ImagePreviewOverlay from 'mainFe/ImagePreviewOverlay';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { useSelector } from 'react-redux';
import { z } from 'zod';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';

import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import FormInput from '../../components/forms/form-input';
import FormFileUpload from '../../components/forms/form-file-upload';
import { levelsService } from '../../services/levels.service';

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

const levelSchema = z.object({
  levelNumber: z.coerce.number().int('Level number must be an integer').min(1, 'Level number must be 1 or greater'),
  levelName: z.string().min(1, 'Name is required').max(120, 'Must be ≤ 120 characters').trim(),
  levelCode: z.string().min(1, 'Code is required').max(50, 'Must be ≤ 50 characters').trim().toUpperCase(),
  description: z.string().max(500, 'Must be ≤ 500 characters').optional().or(z.literal('')),
  levelIcon: z.any().optional().nullable(),
  canHaveChildren: z.boolean().default(true),
});

export type LevelFormData = z.infer<typeof levelSchema>;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const LevelForm = () => {
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'levels',
    basePath: '/levels',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const imageOverlayRef = useRef<any>(null);

  // Get current user from Redux store
  const currentUser = useSelector((state: any) => state.auth?.user);

  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Icon metadata state - stores file ID, filename and direct URL
  const [iconMeta, setIconMeta] = useState<{ id: string; filename: string; url: string } | null>(null);

  // Preview image URL state
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Cleanup preview URL on unmount or change (only for blob URLs)
  useEffect(() => {
    return () => {
      if (previewImageUrl && previewImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewImageUrl);
      }
    };
  }, [previewImageUrl]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<LevelFormData>({
    resolver: zodResolver(levelSchema) as Resolver<LevelFormData>,
    defaultValues: {
      levelNumber: 1,
      levelName: '',
      levelCode: '',
      description: '',
      levelIcon: null,
      canHaveChildren: true,
    },
    mode: 'onChange',
  });

  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Fetch existing entity when editing
  const { data: existing, isLoading: fetchLoading } = useQuery({
    queryKey: ['levels', id],
    queryFn: async () => await levelsService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show level name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? existing?.levelName : null);

  useEffect(() => {
    if (existing && isEditMode) {
      console.log('Resetting form with existing data:', existing);
      reset({
        levelNumber: existing.levelNumber ?? 1,
        levelName: existing.levelName || '',
        levelCode: existing.levelCode || '',
        description: existing.description || '',
        levelIcon: existing.levelIcon || null,
        canHaveChildren: existing.canHaveChildren ?? true,
      });

      // Fetch icon metadata if icon exists
      if (existing.levelIcon) {
        const iconId = existing.levelIcon;
        const downloadApiUrl = getDownloadUrl(iconId);
        const token = localStorage.getItem('accessToken');

        // Call the download API to get the signed URL with filename
        fetch(downloadApiUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => res.json())
          .then((data) => {
            if (data?.success && data?.data?.url) {
              const signedUrl = data.data.url;
              // Extract filename from the signed URL
              let filename = iconId;
              try {
                const urlObj = new URL(signedUrl);
                const rscd = urlObj.searchParams.get('rscd');
                if (rscd) {
                  const filenameMatch = rscd.match(/filename[*]?=["']?([^"';\s]+)/i);
                  if (filenameMatch && filenameMatch[1]) {
                    filename = decodeURIComponent(filenameMatch[1]);
                  }
                }
              } catch (e) {
                console.error('Failed to extract filename from URL:', e);
              }

              setIconMeta({
                id: iconId,
                filename,
                url: signedUrl,
              });
            } else {
              setIconMeta({
                id: iconId,
                filename: iconId,
                url: downloadApiUrl,
              });
            }
          })
          .catch((err) => {
            console.error('Failed to fetch icon metadata:', err);
            setIconMeta({
              id: iconId,
              filename: iconId,
              url: downloadApiUrl,
            });
          });
      } else {
        setIconMeta(null);
      }
    }
  }, [existing, isEditMode, reset]);

  // Mutations
  const createMut = useMutation({
    mutationFn: (payload: any) => levelsService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['levels'] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Level created successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to save Level',
        life: 10000,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => levelsService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['levels'] });
      queryClient.invalidateQueries({ queryKey: ['levels', id] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Level updated successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to save Level',
        life: 10000,
      });
    },
  });

  // Combined loading state for button disable
  const isSaving = createMut.isPending || updateMut.isPending || uploadProgress !== null;

  /**
   * Handle File Upload
   */
  const handleFileUpload = async (file: File): Promise<string> => {
    try {
      setUploadProgress(0);
      const fileId = await uploadFile(
        file,
        {
          uploadedBy: currentUser?._id || 'unknown',
          module: 'CORE',
        },
        (progress: number) => {
          setUploadProgress(progress);
        }
      );
      setUploadProgress(null);
      return fileId;
    } catch (error) {
      setUploadProgress(null);
      throw error;
    }
  };

  // Submit
  const onSubmit = async (data: LevelFormData) => {
    try {
      let iconId = data.levelIcon;

      // Check if icon is a File object and needs uploading
      if (data.levelIcon instanceof File) {
        try {
          iconId = await handleFileUpload(data.levelIcon);
        } catch (error) {
          console.error('File upload failed:', error);
          toast.current?.show({
            severity: 'error',
            summary: 'Upload Error',
            detail: 'Failed to upload level icon. Please try again.',
            life: 10000,
          });
          return;
        }
      }

      const payload = {
        levelNumber: data.levelNumber,
        levelName: data.levelName,
        levelCode: data.levelCode,
        description: data.description || undefined,
        levelIcon: iconId || null,
        canHaveChildren: data.canHaveChildren,
      };

      if (isEditMode) updateMut.mutate(payload);
      else createMut.mutate(payload);
    } catch (error) {
      console.error('Submit error:', error);
    }
  };

  // Loading state
  if (fetchLoading) {
    return (
      <div className="py-8 px-6 flex justify-center items-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <ImagePreviewOverlay ref={imageOverlayRef} src={previewImageUrl || ''} />

      <div className="py-8 px-6" data-testid="SCR-Level-Form">
        {/* Header */}
        <div className="mb-6">
          <button
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
            onClick={() => handleNavigate('/levels')}
          >
            <i className="pi pi-arrow-left" style={{ fontSize: '1.25rem' }} />
            Back to Levels
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isEditMode ? 'Edit Level' : 'Create Level'}
          </h1>
        </div>

        {/* Upload Progress */}
        {uploadProgress !== null && (
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Uploading icon...</p>
            <ProgressBar value={uploadProgress} showValue />
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Level Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Level Number */}
              <Controller
                name="levelNumber"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    type="number"
                    value={field.value ?? 0}
                    label="Level Order"
                    required
                    placeholder="0"
                    error={!!errors.levelNumber}
                    helperText={errors.levelNumber?.message}
                  />
                )}
              />

              {/* Icon - File Upload */}
              <Controller
                name="levelIcon"
                control={control}
                render={({ field: { value, onChange } }) => (
                  <FormFileUpload
                    name="levelIcon"
                    label="Level Icon"
                    value={value}
                    onChange={(file) => {
                      onChange(file);
                      // Clear icon metadata when file changes
                      if (file) {
                        setIconMeta(null);
                      }
                    }}
                    accept="image/*"
                    maxSize={2}
                    displayName={iconMeta?.filename}
                    onPreview={
                      !uploadProgress && typeof value === 'string' && value && iconMeta?.url
                        ? (e) => {
                            const target = e.currentTarget;
                            setPreviewImageUrl(iconMeta.url);
                            imageOverlayRef.current?.show(e, target);
                          }
                        : undefined
                    }
                  />
                )}
              />

              {/* Name */}
              <Controller
                name="levelName"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value ?? ''}
                    label="Level Name"
                    required
                    placeholder="Enter level name"
                    error={!!errors.levelName}
                    helperText={errors.levelName?.message}
                  />
                )}
              />

              {/* Code */}
              <Controller
                name="levelCode"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value ?? ''}
                    label="Level Code (Unique)"
                    required
                    placeholder="DISTRICT"
                    error={!!errors.levelCode}
                    helperText={errors.levelCode?.message}
                  />
                )}
              />

              {/* Description */}
              <div className="md:col-span-2">
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value ?? ''}
                      label="Description"
                      placeholder="Brief description of this level"
                      error={!!errors.description}
                      helperText={errors.description?.message}
                      multiline
                      rows={3}
                    />
                  )}
                />
              </div>

              {/* Can Have Children - Custom checkbox */}
              <div className="flex items-end pb-2">
                <Controller
                  name="canHaveChildren"
                  control={control}
                  render={({ field: { value, onChange, ...field } }) => (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        {...field}
                        type="checkbox"
                        checked={value}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Can have child units
                      </span>
                    </label>
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
              onClick={() => handleNavigate('/levels')}
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
        testId="LevelForm.Dialog.Leave"
      />
    </>
  );
};

export default LevelForm;
