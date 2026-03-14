/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { z } from 'zod';

import { Toast } from 'mainFe/Toast';
import { Input } from 'mainFe/Input';
import { TextArea } from 'mainFe/TextArea';
import { Dropdown } from 'mainFe/Dropdown';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { ProgressSpinner } from 'primereact/progressspinner';
import { extractErrorMessage } from '../../utils/error-handler';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import { valueSetsService } from '../../services/value-sets.service';
import { modulesService } from '../../services/modules.service';
import type { Module } from '../../types';
import styles from './value-set-form.module.css';

// Zod Validation Schema with dynamic labels
const valueSetItemSchema = z.object({
  code: z
    .string()
    .min(1, 'Code is required')
    .max(50, 'Code must not exceed 50 characters')
    .trim(),
  labels: z.record(z.string(), z.string()).refine(
    (labels) => Object.keys(labels).length > 0,
    {
      message: 'At least one label is required',
    }
  ),
});

const valueSetSchema = z.object({
  key: z
    .string()
    .min(1, 'Key is required')
    .max(100, 'Key must not exceed 100 characters')
    .trim(),
  module: z
    .string()
    .max(50, 'Module must not exceed 50 characters')
    .trim()
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description must not exceed 500 characters')
    .trim(),
  items: z.array(valueSetItemSchema).min(1, 'At least one item is required'),
});

type ValueSetFormData = z.infer<typeof valueSetSchema>;

const ValueSetForm = () => {
  const navigate = useAppNavigate();
  const { key } = useParams<{ key: string }>();
  const isEditMode = Boolean(key);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  const DRAFT_KEY = `value-set-draft-${isEditMode ? key : 'new'}`;

  // Draft state
  const [draftData, setDraftData] = useState<ValueSetFormData | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  // Track which items have the "add more label" row visible
  const [showAddLabelRow, setShowAddLabelRow] = useState<Record<number, boolean>>({});

  // React Hook Form
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ValueSetFormData>({
    resolver: zodResolver(valueSetSchema),
    defaultValues: {
      key: '',
      module: '',
      description: '',
      items: [{ code: '', labels: {} }],
    },
    mode: 'onChange',
  });

  // Navigation blocker for unsaved changes
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const formValues = watch();

  // Fetch modules for dropdown
  const { data: modules = [] } = useQuery({
    queryKey: ['modules-dropdown'],
    queryFn: () => modulesService.getAllForDropdown(),
  });

  // Transform modules to options for Dropdown
  const moduleOptions = modules.map((m: Module) => ({
    value: m.name,
    label: m.name,
  }));

  // Fetch value set data for edit mode
  const { data: valueSet, isLoading: fetchLoading } = useQuery({
    queryKey: ['value-sets', key, 'full'],
    queryFn: () => valueSetsService.getByKeyFull(key!),
    enabled: isEditMode && !!key,
  });

  // Set breadcrumb title to show value set key instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? valueSet?.key : null);

  // Populate form when value set data is loaded
  useEffect(() => {
    if (valueSet && isEditMode) {
      // Transform items: backend might return either 'label' (string) or 'labels' (object)
      const transformedItems = valueSet.items && valueSet.items.length > 0
        ? valueSet.items.map((item: any) => {
            // Check if item has 'label' (single string) or 'labels' (object)
            if (item.label && typeof item.label === 'string') {
              // Backend returned localized format - convert to full format
              return {
                code: item.code,
                labels: { en: item.label }
              };
            } else if (item.labels && typeof item.labels === 'object') {
              // Backend returned full format - use as is
              return {
                code: item.code,
                labels: item.labels
              };
            } else {
              // Fallback
              return {
                code: item.code || '',
                labels: {}
              };
            }
          })
        : [{ code: '', labels: {} }];

      const formData = {
        key: valueSet.key || '',
        module: valueSet.module || '',
        description: valueSet.description || '',
        items: transformedItems,
      };
      reset(formData);
    }
  }, [valueSet, isEditMode, reset]);

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
      if (isEditMode && key) {
        return valueSetsService.update(key, data);
      }
      return valueSetsService.create(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['value-sets'] });

      // Also refresh the cache for this value set on the server
      if (data?.key) {
        valueSetsService.refreshCache(data.key).catch(err =>
          console.warn('Failed to refresh cache:', err)
        );
      }

      localStorage.removeItem(DRAFT_KEY);

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Value Set ${isEditMode ? 'updated' : 'created'} successfully`,
        life: 3000,
      });

      // Increased delay to ensure snackbar is visible
      setTimeout(() => {
        navigate('/value-sets');
      }, 2000);
    },
    onError: (error: any) => {
      console.error('Error response:', error.response);
      const errorMessage = extractErrorMessage(error, `Failed to ${isEditMode ? 'update' : 'create'} value set`);
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

  const onSubmit = (data: ValueSetFormData) => {
    try {
      mutation.mutate(data);
    } catch (error) {
      console.error('Error calling mutation.mutate:', error);
    }
  };

  // Check if there's pending label input value (for validation bypass)
  const hasPendingLabelValue = (itemIndex: number): boolean => {
    const labelInput = document.getElementById(`new-label-${itemIndex}`) as HTMLInputElement;
    return !!(labelInput?.value?.trim());
  };

  // Handle form submission - auto-add pending labels before submit
  const handleFormSubmit = () => {
    // First, auto-add any pending labels
    let hasAddedLabels = false;
    formValues.items.forEach((item, itemIndex) => {
      const hasNoLabels = !item.labels || Object.keys(item.labels).length === 0;
      const langInput = document.getElementById(`new-lang-${itemIndex}`) as HTMLInputElement;
      const labelInput = document.getElementById(`new-label-${itemIndex}`) as HTMLInputElement;

      const langCode = hasNoLabels ? 'en' : langInput?.value?.trim();
      const labelValue = labelInput?.value?.trim();

      // If there's a pending label value, auto-add it
      if (langCode && labelValue) {
        handleAddLabel(itemIndex, langCode, labelValue);
        if (labelInput) labelInput.value = '';
        if (!hasNoLabels && langInput) langInput.value = '';
        hasAddedLabels = true;
      }
    });

    // If we added labels, wait for state update then submit
    if (hasAddedLabels) {
      setTimeout(() => {
        handleSubmit(onSubmit)();
      }, 50);
    } else {
      // No pending labels, submit directly
      handleSubmit(onSubmit)();
    }
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

  const handleAddItem = () => {
    append({ code: '', labels: {} });
  };

  const handleRemoveItem = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  // Add a new language label to a specific item
  const handleAddLabel = (itemIndex: number, langCode: string, labelValue: string) => {
    const currentLabels = formValues.items[itemIndex].labels || {};
    setValue(`items.${itemIndex}.labels`, {
      ...currentLabels,
      [langCode]: labelValue
    }, { shouldDirty: true, shouldValidate: true });
  };

  // Remove a language label from a specific item
  const handleRemoveLabel = (itemIndex: number, langCode: string) => {
    const currentLabels = { ...formValues.items[itemIndex].labels };
    delete currentLabels[langCode];
    setValue(`items.${itemIndex}.labels`, currentLabels, { shouldDirty: true, shouldValidate: true });
  };

  if (fetchLoading) {
    return (
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900 flex justify-center items-center">
        <ProgressSpinner style={{ width: '50px', height: '50px' }} />
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900" data-testid="SCR-ValueSet-Form">
        {/* Header - Compact */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleNavigate('/value-sets')}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
            >
              <i className="pi pi-arrow-left text-lg" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Value Set' : 'Create New Value Set'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditMode ? 'Update value set configuration and enumeration items' : 'Add a new value set with enumeration values'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => handleNavigate('/value-sets')}
              disabled={isSaving}
            />
            <Button
              type="button"
              label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
              icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
              onClick={handleFormSubmit}
              disabled={isSaving}
            />
          </div>
        </div>
          {/* Draft Recovery Banner */}
          {showDraftBanner && (
            <div className={styles.draftBanner}>
              <div className={styles.draftBannerContent}>
                <i className={`pi pi-exclamation-triangle ${styles.draftBannerIcon}`} />
                <span className={styles.draftBannerText}>
                  You have unsaved changes from a previous session. Would you like to restore them?
                </span>
              </div>
              <div className={styles.draftBannerActions}>
                <Button label="Restore" size="small" onClick={handleRestoreDraft} />
                <Button label="Discard" size="small" severity="secondary" outlined onClick={handleDiscardDraft} />
              </div>
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleFormSubmit(); }}>
            {/* Basic Information */}
            <div className={styles.formSection}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>
                  <i className="pi pi-info-circle" />
                  <span>Basic Information</span>
                </div>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.fieldWrapper}>
                  <label className={styles.label}>
                    Key <span className={styles.required}>*</span>
                  </label>
                  <Controller
                    name="key"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="e.g., ERROR_SEVERITY"
                        error={errors.key?.message}
                        disabled={isEditMode}
                      />
                    )}
                  />
                </div>

                <div className={styles.fieldWrapper}>
                  <label className={styles.label}>Module</label>
                  <Controller
                    name="module"
                    control={control}
                    render={({ field }) => (
                      <Dropdown
                        {...field}
                        value={field.value || null}
                        options={moduleOptions}
                        placeholder="Select module"
                        filter
                        showClear
                      />
                    )}
                  />
                </div>

                <div className={styles.fieldWrapper}>
                  <label className={styles.label}>
                    Description <span className={styles.required}>*</span>
                  </label>
                  <Controller
                    name="description"
                    control={control}
                    render={({ field }) => (
                      <TextArea
                        {...field}
                        placeholder="Brief description of this value set"
                        rows={2}
                        error={errors.description?.message}
                      />
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Enumeration Items */}
            <div className={styles.formSection}>
              <div className={`${styles.sectionHeader} ${styles.sectionHeaderWithButton}`}>
                <div className={styles.sectionHeaderTitle}>
                  <i className="pi pi-list" />
                  <span>Enumeration Items</span>
                </div>
                <Button
                  type="button"
                  label="Add Item"
                  icon="pi pi-plus"
                  size="small"
                  onClick={handleAddItem}
                />
              </div>

              {errors.items && !Array.isArray(errors.items) && (
                <div className={styles.errorMessage}>
                  {errors.items.message}
                </div>
              )}

              <div className={styles.itemsContainer}>
                {fields.map((field, itemIndex) => (
                  <div key={field.id} className={styles.itemCard}>
                    <div className={styles.itemHeader}>
                      <h4 className={styles.itemTitle}>Item {itemIndex + 1}</h4>
                      {fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(itemIndex)}
                          className={styles.deleteItemButton}
                        >
                          <i className="pi pi-trash" />
                        </button>
                      )}
                    </div>

                    {/* Code and Labels Grid */}
                    <div className={styles.itemContent}>
                      {/* Code Field */}
                      <div className={styles.itemFieldWrapper}>
                        <label className={styles.label}>
                          Code <span className={styles.required}>*</span>
                        </label>
                        <Controller
                          name={`items.${itemIndex}.code`}
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              placeholder="e.g., ERROR"
                              error={(errors.items?.[itemIndex] as any)?.code?.message}
                            />
                          )}
                        />
                      </div>

                      {/* Labels Section */}
                      <div className={styles.labelsSection}>
                        <label className={styles.label}>
                          Labels (Multi-language, Click plus) <span className={styles.required}>*</span>
                        </label>

                        {/* Existing Labels */}
                        {formValues.items[itemIndex]?.labels && Object.keys(formValues.items[itemIndex].labels).length > 0 && (
                          <div className={styles.labelsGrid}>
                            {Object.entries(formValues.items[itemIndex].labels).map(([langCode, labelValue]) => (
                              <div key={langCode} className={styles.labelRow}>
                                <Input
                                  value={langCode}
                                  disabled
                                  placeholder="Lang"
                                  onChange={() => {}}
                                />
                                <Input
                                  value={labelValue}
                                  onChange={(e: any) => {
                                    const newValue = typeof e === 'string' ? e : e?.target?.value ?? e;
                                    handleAddLabel(itemIndex, langCode, newValue);
                                  }}
                                  placeholder="e.g., Error, त्रुटि, లోపం"
                                />
                                {/* Always show remove button */}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLabel(itemIndex, langCode)}
                                  className={styles.labelRemoveButton}
                                >
                                  <i className="pi pi-times" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add New Label Row */}
                        {(() => {
                          const hasNoLabels = !formValues.items[itemIndex]?.labels || Object.keys(formValues.items[itemIndex].labels).length === 0;
                          const isAddRowVisible = showAddLabelRow[itemIndex] || false;

                          // Show add row when: no labels exist OR user clicked plus to add more
                          if (!hasNoLabels && !isAddRowVisible) {
                            // Show just a plus button to add more languages
                            return (
                              <button
                                type="button"
                                className={styles.addLanguageButton}
                                onClick={() => {
                                  setShowAddLabelRow(prev => ({ ...prev, [itemIndex]: true }));
                                }}
                                aria-label="Add more languages"
                              >
                                <i className="pi pi-plus" />
                              </button>
                            );
                          }

                          return (
                            <div className={styles.addLabelRow}>
                              <Input
                                id={`new-lang-${itemIndex}`}
                                placeholder="lang"
                                value={hasNoLabels ? 'en' : undefined}
                                defaultValue={hasNoLabels ? undefined : ''}
                                disabled={hasNoLabels}
                                key={`lang-${itemIndex}-${hasNoLabels ? 'first' : 'other'}`}
                                onChange={() => {}}
                              />
                              <Input
                                id={`new-label-${itemIndex}`}
                                placeholder="Enter label text"
                                onChange={() => {}}
                              />
                              <Button
                                type="button"
                                icon="pi pi-plus"
                                size="small"
                                onClick={() => {
                                  const langInput = document.getElementById(`new-lang-${itemIndex}`) as HTMLInputElement;
                                  const labelInput = document.getElementById(`new-label-${itemIndex}`) as HTMLInputElement;
                                  const langCode = hasNoLabels ? 'en' : langInput?.value.trim();
                                  const labelValue = labelInput?.value.trim();

                                  if (langCode && labelValue) {
                                    handleAddLabel(itemIndex, langCode, labelValue);
                                    if (labelInput) labelInput.value = '';
                                    if (!hasNoLabels && langInput) langInput.value = '';
                                    // Hide the add row after adding
                                    setShowAddLabelRow(prev => ({ ...prev, [itemIndex]: false }));
                                  }
                                }}
                                aria-label="Add label"
                              />
                            </div>
                          );
                        })()}

                        {(errors.items?.[itemIndex] as any)?.labels && !hasPendingLabelValue(itemIndex) && (
                          <small className="text-red-500 text-xs mt-1">
                            {(errors.items?.[itemIndex] as any)?.labels?.message || 'At least one label is required'}
                          </small>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>
      </div>

      {/* Leave Confirmation Dialog */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="ValueSetForm.Dialog.Leave"
      />
    </>
  );
};

export default ValueSetForm;
