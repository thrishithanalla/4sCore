/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { z } from 'zod';

import { Toast } from 'mainFe/Toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { Dropdown } from 'mainFe/Dropdown';
import { Input } from 'mainFe/Input';
import { TextArea } from 'mainFe/TextArea';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';

import { promptsService } from '../../services/prompts.service';
import { valueSetsService } from '../../services/value-sets.service';
import { modulesService } from '../../services/modules.service';
import { extractErrorMessage } from '../../utils/error-handler';

// Zod Validation Schema
const promptSchema = z.object({
  type: z
    .string()
    .min(1, 'Type is required')
    .max(200, 'Type must not exceed 200 characters')
    .trim(),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(200, 'Name must not exceed 200 characters')
    .trim(),
  aiRole: z
    .string()
    .min(1, 'AI Role is required')
    .trim(),
  systemRole: z
    .string()
    .min(1, 'System Role is required')
    .trim(),
  objective: z
    .string()
    .min(1, 'Objective is required')
    .trim(),
  moduleId: z.string().optional().or(z.literal('')),
  iconPath: z.string().max(500, 'Icon Path must not exceed 500 characters').optional().or(z.literal('')),
  tech: z.string().optional().or(z.literal('')),
  taskInstructions: z.string().optional().or(z.literal('')),
  taskInput: z.string().optional().or(z.literal('')),
  taskOutputFormat: z.string().optional().or(z.literal('')),
  taskExample: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (val) => {
        if (!val || val === '') return true;
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Task Example must be valid JSON' }
    ),
  llm: z.string().max(100, 'LLM must not exceed 100 characters').optional().or(z.literal('')),
  settingsJson: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (val) => {
        if (!val || val === '') return true;
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Settings JSON must be valid JSON' }
    ),
});

type PromptFormData = z.infer<typeof promptSchema>;

const PromptForm = () => {
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'prompt',
    basePath: '/prompt-table',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  const DRAFT_KEY = `prompt-draft-${isEditMode ? id : 'new'}`;

  // Draft state
  const [draftData, setDraftData] = useState<PromptFormData | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  // React Hook Form
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<PromptFormData>({
    resolver: zodResolver(promptSchema),
    defaultValues: {
      type: '',
      name: '',
      aiRole: '',
      systemRole: '',
      objective: '',
      moduleId: '',
      iconPath: '',
      tech: '',
      taskInstructions: '',
      taskInput: '',
      taskOutputFormat: '',
      taskExample: '',
      llm: '',
      settingsJson: '',
    },
    mode: 'onChange',
  });

  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  const formValues = watch();

  // Fetch prompt data for edit mode - wait for ID decryption
  const { data: prompt, isLoading: fetchLoading } = useQuery({
    queryKey: ['prompts', id],
    queryFn: () => promptsService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Fetch LLM options from value-sets API
  const { data: llmValueSet, isLoading: llmLoading } = useQuery({
    queryKey: ['value-sets', 'LLM'],
    queryFn: () => valueSetsService.getByKey('LLM', 'en'),
  });

  // Fetch modules for dropdown
  const { data: modulesData = [], isLoading: modulesLoading } = useQuery({
    queryKey: ['modules-dropdown'],
    queryFn: () => modulesService.getAllForDropdown(),
  });

  // Transform LLM items to dropdown options (use label as value)
  const llmOptions = (llmValueSet?.items || []).map((item: any) => ({
    label: item.label,
    value: item.label,
  }));

  // Transform modules to dropdown options
  const moduleOptions = modulesData.map((module: any) => ({
    label: module.name,
    value: module._id,
  }));

  // Set breadcrumb title to show prompt name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? prompt?.name : null);

  // Populate form when prompt data is loaded
  useEffect(() => {
    if (prompt && isEditMode) {
      reset({
        type: prompt.type || '',
        name: prompt.name || '',
        aiRole: prompt.aiRole || '',
        systemRole: prompt.systemRole || '',
        objective: prompt.objective || '',
        moduleId: prompt.moduleId || '',
        iconPath: prompt.iconPath || '',
        tech: prompt.tech || '',
        taskInstructions: prompt.taskInstructions || '',
        taskInput: prompt.taskInput || '',
        taskOutputFormat: prompt.taskOutputFormat || '',
        taskExample: prompt.taskExample ? JSON.stringify(prompt.taskExample, null, 2) : '',
        llm: prompt.llm || '',
        settingsJson: prompt.settingsJson ? JSON.stringify(prompt.settingsJson, null, 2) : '',
      });
    }
  }, [prompt, isEditMode, reset]);

  // Draft autosave (only for create mode)
  useEffect(() => {
    if (isEditMode || !isDirty) return;

    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(formValues));
    }, 1500);

    return () => clearTimeout(timer);
  }, [formValues, isDirty, isEditMode, DRAFT_KEY]);

  // Load draft on mount (create mode only)
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

  // Mutation
  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (isEditMode && id) {
        return promptsService.update(id, data);
      }
      return promptsService.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      localStorage.removeItem(DRAFT_KEY);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Prompt ${isEditMode ? 'updated' : 'created'} successfully`,
        life: 3000,
      });
      setTimeout(() => {
        navigateToList();
      }, 1000);
    },
    onError: (error: any) => {
      const errorMessage = extractErrorMessage(error, `Failed to ${isEditMode ? 'update' : 'create'} prompt`);
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

  const onSubmit = (data: PromptFormData) => {
    const payload: any = {
      type: data.type,
      name: data.name,
      aiRole: data.aiRole,
      systemRole: data.systemRole,
      objective: data.objective,
      moduleId: data.moduleId || null,
      iconPath: data.iconPath || null,
      tech: data.tech || null,
      taskInstructions: data.taskInstructions || null,
      taskInput: data.taskInput || null,
      taskOutputFormat: data.taskOutputFormat || null,
      taskExample: data.taskExample ? JSON.parse(data.taskExample) : null,
      llm: data.llm || null,
      settingsJson: data.settingsJson ? JSON.parse(data.settingsJson) : null,
    };

    try {
      mutation.mutate(payload);
    } catch (error) {
      console.error('Error calling mutation.mutate:', error);
    }
  };

  const handleLoadDraft = () => {
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

  if (fetchLoading) {
    return (
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900 flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900" data-testid="SCR-Prompt-Form">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleNavigate('/prompt-table')}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
              data-testid="PromptForm.Button.Back"
            >
              <i className="pi pi-arrow-left text-lg" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Prompt' : 'Create New Prompt'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditMode ? 'Update prompt configuration' : 'Configure a new AI prompt template'}
              </p>
            </div>
          </div>
        </div>

        {/* Draft Banner */}
        {showDraftBanner && draftData && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className="pi pi-exclamation-triangle text-amber-600" />
              <span className="text-sm text-amber-800 dark:text-amber-200">
                You have unsaved changes from a previous session. Would you like to restore them?
              </span>
            </div>
            <div className="flex gap-2">
              <Button label="Restore" size="small" onClick={handleLoadDraft} />
              <Button label="Discard" size="small" severity="secondary" outlined onClick={handleDiscardDraft} />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <i className="pi pi-info-circle text-blue-600" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">Basic Information</span>
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="type"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="e.g., text, code, data-analysis"
                        error={errors.type?.message}
                      />
                    )}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="name"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="Unique prompt name"
                        error={errors.name?.message}
                      />
                    )}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Module
                  </label>
                  <Controller
                    name="moduleId"
                    control={control}
                    render={({ field }) => (
                      <Dropdown
                        value={field.value || null}
                        onChange={(e: { value: string }) => field.onChange(e.value || '')}
                        options={moduleOptions}
                        placeholder={modulesLoading ? 'Loading...' : 'Select Module'}
                        disabled={modulesLoading}
                        filter
                        showClear
                      />
                    )}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    AI Role <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="aiRole"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="e.g., Code Assistant, Data Analyst"
                        error={errors.aiRole?.message}
                      />
                    )}
                  />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    System Role <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="systemRole"
                    control={control}
                    render={({ field }) => (
                      <TextArea
                        {...field}
                        placeholder="System's expected actions or interactions"
                        rows={3}
                        error={errors.systemRole?.message}
                      />
                    )}
                  />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Objective <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="objective"
                    control={control}
                    render={({ field }) => (
                      <TextArea
                        {...field}
                        placeholder="Main goal or function of the prompt"
                        rows={3}
                        error={errors.objective?.message}
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Configuration */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <i className="pi pi-cog text-blue-600" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">Configuration</span>
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    LLM
                  </label>
                  <Controller
                    name="llm"
                    control={control}
                    render={({ field }) => (
                      <Dropdown
                        value={field.value || null}
                        onChange={(e: { value: string }) => field.onChange(e.value || '')}
                        options={llmOptions}
                        placeholder={llmLoading ? 'Loading...' : 'Select LLM'}
                        disabled={llmLoading}
                        filter
                        showClear
                      />
                    )}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Tech
                  </label>
                  <Controller
                    name="tech"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="Technology stack"
                        error={errors.tech?.message}
                      />
                    )}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Icon Path
                  </label>
                  <Controller
                    name="iconPath"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="File or asset path to an icon"
                        error={errors.iconPath?.message}
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Task Details */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <i className="pi pi-list text-blue-600" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">Task Details</span>
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Task Instructions
                  </label>
                  <Controller
                    name="taskInstructions"
                    control={control}
                    render={({ field }) => (
                      <TextArea
                        {...field}
                        placeholder="Steps or logic flow to execute the task"
                        rows={4}
                        error={errors.taskInstructions?.message}
                      />
                    )}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Task Input
                  </label>
                  <Controller
                    name="taskInput"
                    control={control}
                    render={({ field }) => (
                      <TextArea
                        {...field}
                        placeholder="Required inputs or parameters"
                        rows={3}
                        error={errors.taskInput?.message}
                      />
                    )}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Task Output Format
                  </label>
                  <Controller
                    name="taskOutputFormat"
                    control={control}
                    render={({ field }) => (
                      <TextArea
                        {...field}
                        placeholder="Expected structure or data format of output"
                        rows={3}
                        error={errors.taskOutputFormat?.message}
                      />
                    )}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Task Example (JSON)
                  </label>
                  <Controller
                    name="taskExample"
                    control={control}
                    render={({ field }) => (
                      <TextArea
                        {...field}
                        placeholder='{"input": "example", "output": "result"}'
                        rows={4}
                        error={errors.taskExample?.message}
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <i className="pi pi-sliders-h text-blue-600" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">Settings</span>
              </div>
            </div>
            <div className="p-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Settings JSON
                </label>
                <Controller
                  name="settingsJson"
                  control={control}
                  render={({ field }) => (
                    <TextArea
                      {...field}
                      placeholder='{"temperature": 0.7, "maxTokens": 1000}'
                      rows={5}
                      error={errors.settingsJson?.message}
                    />
                  )}
                />
              </div>
            </div>
          </div>

          {/* Form Errors */}
          {Object.keys(errors).length > 0 && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
              <i className="pi pi-exclamation-circle text-red-600" />
              <span className="text-sm text-red-800 dark:text-red-200">
                Please fix the errors above before submitting.
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => handleNavigate('/prompt-table')}
              disabled={isSaving}
            />
            <Button
              type="submit"
              label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
              icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
              disabled={isSaving}
              data-testid="PromptForm.Button.Submit"
            />
          </div>
        </form>
      </div>

      {/* Leave Confirmation Dialog */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="PromptForm.Dialog.Leave"
      />
    </>
  );
};

export default PromptForm;
