/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Message } from 'primereact/message';
import { Toast } from 'mainFe/Toast';
import { Skeleton } from 'mainFe/Skeleton';
import { FloatLabelDropdown } from 'mainFe/FloatLabelDropdown';
import { Input } from 'mainFe/Input';
import { Tag } from 'mainFe/Tag';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import FormInput from '../../components/forms/form-input';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import { feedbackMasterService, getModulesForDropdown } from '../../services/feedback-master.service';
import { valueSetsService } from '../../services/value-sets.service';
import { extractErrorMessage } from '../../utils/error-handler';

/**
 * Validation Schema - Zod
 */
const feedbackMasterSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(300, 'Name must not exceed 300 characters')
    .trim(),

  componentType: z
    .string()
    .min(1, 'Component type is required'),

  moduleId: z
    .string()
    .min(1, 'Module is required'),

  options: z.object({
    likedOptions: z.array(z.string()).max(10, 'Maximum 10 liked options allowed').optional().default([]),
    dislikedOptions: z.array(z.string()).max(10, 'Maximum 10 disliked options allowed').optional().default([]),
  }).optional().default({ likedOptions: [], dislikedOptions: [] }),
});

type FeedbackMasterFormData = z.infer<typeof feedbackMasterSchema>;

// Component type options are now fetched dynamically from the value-sets API

const FeedbackMasterForm = () => {
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'feedback-master',
    basePath: '/feedback-master',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const DRAFT_KEY = `feedback-master-form-draft-${id || 'create'}`;

  // State
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);
  const [newLikedOption, setNewLikedOption] = useState('');
  const [newDislikedOption, setNewDislikedOption] = useState('');

  // Fetch component types from value-sets API
  const { data: componentTypeOptions = [] } = useQuery({
    queryKey: ['valueSets', 'componentType'],
    queryFn: async () => {
      const response = await valueSetsService.getAll({
        search: 'componentType',
        sort_order: 'asc',
      });
      const valueSet = response.data?.[0];
      if (valueSet?.items) {
        return valueSet.items.map((item: any) => ({
          label: item.labels?.en || item.code,
          value: item.code.toLowerCase(),
        }));
      }
      return [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: modules = [] } = useQuery({
    queryKey: ['modules', 'dropdown'],
    queryFn: getModulesForDropdown,
    staleTime: 5 * 60 * 1000,
  });

  const moduleOptions = modules.map((m) => ({
    label: m.name,
    value: m._id,
  }));

  // Form setup
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<FeedbackMasterFormData>({
    resolver: zodResolver(feedbackMasterSchema) as any,
    defaultValues: {
      name: '',
      componentType: undefined,
      moduleId: '',
      options: {
        likedOptions: [],
        dislikedOptions: [],
      },
    },
    mode: 'onChange',
  });

  const formValues = watch();

  // Navigation blocker for unsaved changes
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Fetch feedback master data for edit mode - wait for ID decryption
  const { data: feedbackMasterData, isLoading: dataLoading } = useQuery({
    queryKey: ['feedbackMaster', id],
    queryFn: () => feedbackMasterService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show feedback master name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? feedbackMasterData?.name : null);

  // Populate form in edit mode
  useEffect(() => {
    if (feedbackMasterData && isEditMode) {
      reset({
        name: feedbackMasterData.name || '',
        componentType: feedbackMasterData.componentType,
        moduleId: feedbackMasterData.moduleId || '',
        options: {
          likedOptions: feedbackMasterData.options?.likedOptions || [],
          dislikedOptions: feedbackMasterData.options?.dislikedOptions || [],
        },
      });
    }
  }, [feedbackMasterData, isEditMode, reset]);

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (isEditMode && id) {
        return feedbackMasterService.update(id, data);
      }
      return feedbackMasterService.create(data);
    },
    onSuccess: () => {
      // Clear any pending autosave timer to prevent race condition
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }

      queryClient.invalidateQueries({ queryKey: ['feedbackMasters'] });
      if (isEditMode && id) {
        queryClient.invalidateQueries({ queryKey: ['feedbackMaster', id] });
      }
      localStorage.removeItem(DRAFT_KEY);

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Feedback Master ${isEditMode ? 'updated' : 'created'} successfully`,
        life: 3000,
      });

      setTimeout(() => {
        navigateToList();
      }, 1000);
    },
    onError: (error: any) => {
      console.error('Error response:', error.response);
      const errorMessage = extractErrorMessage(error, `Failed to ${isEditMode ? 'update' : 'create'} feedback master`);
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

    draftTimerRef.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(formValues));
      draftTimerRef.current = null;
    }, 1500);

    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
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
  const onSubmit = async (data: FeedbackMasterFormData) => {
    const hasLikedOptions = data.options?.likedOptions && data.options.likedOptions.length > 0;
    const hasDislikedOptions = data.options?.dislikedOptions && data.options.dislikedOptions.length > 0;

    const payload = {
      name: data.name,
      componentType: data.componentType,
      moduleId: data.moduleId,
      options: (hasLikedOptions || hasDislikedOptions) ? {
        likedOptions: data.options?.likedOptions || [],
        dislikedOptions: data.options?.dislikedOptions || [],
      } : undefined,
    };

    try {
      await mutation.mutateAsync(payload);
    } catch {
      console.log('Error caught and handled by onError callback');
    }
  };

  if (dataLoading) {
    return (
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="mb-4">
          <Skeleton width="300px" height="1.75rem" />
          <Skeleton width="200px" height="1rem" className="mt-2" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-3">
          <Skeleton height="2.5rem" className="mb-3" />
          <Skeleton height="2.5rem" className="mb-3" />
          <Skeleton height="2.5rem" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <Skeleton height="2.5rem" className="mb-3" />
          <Skeleton height="5rem" />
        </div>
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />

      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900 min-h-screen" data-testid="SCR-FeedbackMaster-Form">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleNavigate('/feedback-master')}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
            >
              <i className="pi pi-arrow-left text-lg" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Feedback Master' : 'Create Feedback Master'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditMode ? 'Update feedback master configuration' : 'Add a new feedback master configuration'}
              </p>
            </div>
          </div>
        </div>

        {/* Draft Recovery Banner */}
        {showDraftBanner && (
          <div className="mb-3">
            <Message
              severity="info"
              content={
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <i className="pi pi-exclamation-circle" />
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
          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <i className="pi pi-info-circle text-blue-500" />
              Basic Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Name */}
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <FormInput
                    name={field.name}
                    value={field.value ?? ''}
                    onChange={field.onChange as (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void}
                    label="Name"
                    required
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    autoFocus
                  />
                )}
              />

              {/* Component Type */}
              <Controller
                name="componentType"
                control={control}
                render={({ field }) => (
                  <FloatLabelDropdown
                    name={field.name}
                    label="Component Type"
                    value={field.value || ''}
                    onChange={(e: { target: { value: string } }) => field.onChange(e.target.value)}
                    options={componentTypeOptions}
                    required
                    error={!!errors.componentType}
                    helperText={errors.componentType?.message}
                    className="w-full"
                  />
                )}
              />

              {/* Module */}
              <Controller
                name="moduleId"
                control={control}
                render={({ field }) => (
                  <FloatLabelDropdown
                    name={field.name}
                    label="Module"
                    value={field.value || ''}
                    onChange={(e: { target: { value: string } }) => field.onChange(e.target.value)}
                    options={moduleOptions}
                    required
                    showClear
                    error={!!errors.moduleId}
                    helperText={errors.moduleId?.message}
                    className="w-full"
                  />
                )}
              />
            </div>
          </div>

          {/* Feedback Options */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <i className="pi pi-list text-blue-500" />
              Feedback Options
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Liked Options */}
              <div className="border border-green-200 dark:border-green-900 rounded-lg p-3 bg-green-50/50 dark:bg-green-950/20">
                <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1.5">
                  <i className="pi pi-thumbs-up text-sm" />
                  Liked Options
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Predefined options for positive feedback (max 10).
                </p>

                <Controller
                  name="options.likedOptions"
                  control={control}
                  render={({ field }) => {
                    const likedOptions = field.value || [];
                    const isAtLimit = likedOptions.length >= 10;

                    const handleAddLikedOption = () => {
                      if (isAtLimit) return;
                      const trimmed = newLikedOption.trim();
                      if (trimmed && !likedOptions.includes(trimmed)) {
                        field.onChange([...likedOptions, trimmed]);
                        setNewLikedOption('');
                      }
                    };

                    const handleRemoveLikedOption = (indexToRemove: number) => {
                      field.onChange(likedOptions.filter((_: string, i: number) => i !== indexToRemove));
                    };

                    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLikedOption();
                      }
                    };

                    return (
                      <div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <Input
                              value={newLikedOption}
                              onChange={(value: string) => setNewLikedOption(value)}
                              onKeyDown={handleKeyDown}
                              placeholder={isAtLimit ? 'Maximum 10 reached' : 'Type option & press Enter'}
                              disabled={isAtLimit}
                            />
                          </div>
                          <Button
                            type="button"
                            label="Add"
                            icon="pi pi-plus"
                            onClick={handleAddLikedOption}
                            disabled={!newLikedOption.trim() || isAtLimit}
                            severity="success"
                            size="small"
                          />
                        </div>

                        {likedOptions.length > 0 ? (
                          <div className="mt-3">
                            <div className="flex flex-wrap gap-2">
                              {likedOptions.map((option: string, index: number) => (
                                <div key={index} className="inline-flex items-center gap-1 bg-white dark:bg-gray-700 rounded-md border border-green-200 dark:border-green-800 px-2 py-1">
                                  <Tag value={option} severity="success" />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLikedOption(index)}
                                    className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-gray-400 hover:text-red-500"
                                    title="Remove option"
                                  >
                                    <i className="pi pi-times text-xs" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                              {likedOptions.length}/10 liked option{likedOptions.length !== 1 ? 's' : ''} added
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 border border-dashed border-green-300 dark:border-green-800 rounded-lg py-4 text-center">
                            <i className="pi pi-thumbs-up text-green-300 dark:text-green-700 text-xl block mb-1" />
                            <p className="text-xs text-gray-500 dark:text-gray-400">No liked options yet</p>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
              </div>

              {/* Disliked Options */}
              <div className="border border-red-200 dark:border-red-900 rounded-lg p-3 bg-red-50/50 dark:bg-red-950/20">
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1.5">
                  <i className="pi pi-thumbs-down text-sm" />
                  Disliked Options
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Predefined options for negative feedback (max 10).
                </p>

                <Controller
                  name="options.dislikedOptions"
                  control={control}
                  render={({ field }) => {
                    const dislikedOptions = field.value || [];
                    const isAtLimit = dislikedOptions.length >= 10;

                    const handleAddDislikedOption = () => {
                      if (isAtLimit) return;
                      const trimmed = newDislikedOption.trim();
                      if (trimmed && !dislikedOptions.includes(trimmed)) {
                        field.onChange([...dislikedOptions, trimmed]);
                        setNewDislikedOption('');
                      }
                    };

                    const handleRemoveDislikedOption = (indexToRemove: number) => {
                      field.onChange(dislikedOptions.filter((_: string, i: number) => i !== indexToRemove));
                    };

                    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddDislikedOption();
                      }
                    };

                    return (
                      <div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <Input
                              value={newDislikedOption}
                              onChange={(value: string) => setNewDislikedOption(value)}
                              onKeyDown={handleKeyDown}
                              placeholder={isAtLimit ? 'Maximum 10 reached' : 'Type option & press Enter'}
                              disabled={isAtLimit}
                            />
                          </div>
                          <Button
                            type="button"
                            label="Add"
                            icon="pi pi-plus"
                            onClick={handleAddDislikedOption}
                            disabled={!newDislikedOption.trim() || isAtLimit}
                            severity="danger"
                            size="small"
                          />
                        </div>

                        {dislikedOptions.length > 0 ? (
                          <div className="mt-3">
                            <div className="flex flex-wrap gap-2">
                              {dislikedOptions.map((option: string, index: number) => (
                                <div key={index} className="inline-flex items-center gap-1 bg-white dark:bg-gray-700 rounded-md border border-red-200 dark:border-red-800 px-2 py-1">
                                  <Tag value={option} severity="danger" />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDislikedOption(index)}
                                    className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-gray-400 hover:text-red-500"
                                    title="Remove option"
                                  >
                                    <i className="pi pi-times text-xs" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                              {dislikedOptions.length}/10 disliked option{dislikedOptions.length !== 1 ? 's' : ''} added
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 border border-dashed border-red-300 dark:border-red-800 rounded-lg py-4 text-center">
                            <i className="pi pi-thumbs-down text-red-300 dark:text-red-700 text-xl block mb-1" />
                            <p className="text-xs text-gray-500 dark:text-gray-400">No disliked options yet</p>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => handleNavigate('/feedback-master')}
              disabled={isSaving}
            />
            <Button
              type="submit"
              label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
              icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
              disabled={isSaving}
            />
          </div>
        </form>

        {/* Leave Confirmation Dialog */}
        <DiscardChangesDialog
          visible={showLeaveDialog}
          onStay={cancelLeave}
          onLeave={confirmLeave}
          testId="FeedbackMasterForm.Dialog.Leave"
        />
      </div>
    </>
  );
};

export default FeedbackMasterForm;
