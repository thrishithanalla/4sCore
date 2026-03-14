/**
 * System Role Form Component
 * Redesigned following Unit Form design pattern
 * Features: Theme compatible, responsive, inline back button
 */

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Toast } from 'mainFe/Toast';
import { MultiSelect } from 'mainFe/MultiSelect';
import { Button } from 'mainFe/Button';
import { Dropdown } from 'mainFe/Dropdown';
import { Tag } from 'mainFe/Tag';
import { LoadingSpinner } from 'mainFe/LoadingSpinner';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import FormInput from '../../components/forms/form-input';
import FormSelect from '../../components/forms/form-select';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { JOB_NAMES } from '../../constants/jobNames';
import { systemRolesService } from '../../services/system-roles.service';
import { extractErrorMessage } from '../../utils/error-handler';
import styles from './system-role-form.module.css';

/**
 * Validation Schema - Zod
 */
const permissionSchema = z.object({
  moduleId: z.string().min(1, 'Module is required'),
  moduleName: z.string(),
  roleId: z.string().min(1, 'Role is required'),
  roleName: z.string(),
});

const systemRoleSchema = z.object({
  roleName: z
    .string()
    .min(1, 'Role name is required')
    .max(120, 'Role name must not exceed 120 characters')
    .regex(/[a-zA-Z]/, 'Role name must contain at least 1 alphabet')
    .trim(),

  roleShortCode: z
    .string()
    .min(1, 'Short code is required')
    .max(20, 'Short code must not exceed 20 characters')
    .trim(),

  description: z
    .string()
    .max(500, 'Description must not exceed 500 characters')
    .optional()
    .or(z.literal('')),

  roleBinding: z
    .array(permissionSchema)
    .min(1, 'At least one module permission is required'),
});

type SystemRoleFormData = z.infer<typeof systemRoleSchema>;

// Export the type for external use
export type { SystemRoleFormData };

// Export the schema for external validation
export { systemRoleSchema };

/**
 * Ref handle for embedded mode - allows parent to get form data and validation status
 */
export interface SystemRoleFormRef {
  getFormData: () => SystemRoleFormData;
  isValid: () => boolean;
  triggerValidation: () => Promise<boolean>;
}

/**
 * Props for SystemRoleForm component
 */
interface SystemRoleFormProps {
  /** When true, renders in embedded mode (no page wrapper, header, or navigation) */
  isEmbedded?: boolean;
  /** Callback when form data changes (for embedded mode) */
  onFormDataChange?: (data: SystemRoleFormData, isValid: boolean) => void;
  /** Initial data for the form (for embedded mode) */
  initialData?: Partial<SystemRoleFormData>;
}

const SystemRoleFormInner = forwardRef<SystemRoleFormRef, SystemRoleFormProps>(({
  isEmbedded = false,
  onFormDataChange,
  initialData,
}, ref) => {
  // Only use navigation hooks in standalone mode
  const navigationResult = isEmbedded ? null : useSecureNavigation({
    entity: 'system-roles',
    basePath: '/system-roles',
  });
  const id = navigationResult?.id;
  const isReady = navigationResult?.isReady ?? true;
  const navigateToList = navigationResult?.navigateToList ?? (() => {});

  const isEditMode = Boolean(id) && !isEmbedded;
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  // Form setup
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    trigger,
    clearErrors,
    formState: { errors, isDirty, isValid },
  } = useForm<SystemRoleFormData>({
    resolver: zodResolver(systemRoleSchema) as any,
    defaultValues: {
      roleName: initialData?.roleName || '',
      roleShortCode: initialData?.roleShortCode || '',
      description: initialData?.description || '',
      roleBinding: initialData?.roleBinding || [],
    },
    mode: 'onChange',
  });

  // Field array for dynamic roleBinding
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'roleBinding',
  });

  // Navigation blocker - disabled in embedded mode
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } =
    useNavigationBlocker({ when: isDirty && !isEmbedded });

  // Expose form methods to parent via ref (for embedded mode)
  useImperativeHandle(ref, () => ({
    getFormData: () => getValues(),
    isValid: () => isValid,
    triggerValidation: () => trigger(),
  }), [getValues, isValid, trigger]);

  // Watch all form values for onFormDataChange callback (embedded mode)
  const formValues = watch();
  useEffect(() => {
    if (isEmbedded && onFormDataChange) {
      onFormDataChange(formValues, isValid);
    }
  }, [formValues, isValid, isEmbedded, onFormDataChange]);

  // Fetch modules with roles for dropdown
  const { data: modulesWithRoles = [], isLoading: modulesLoading } = useQuery({
    queryKey: ['modules-with-roles'],
    queryFn: () => systemRolesService.getModulesWithRoles(),
  });

  // Fetch system role data for edit mode (only in standalone mode)
  const { data: roleData, isLoading: roleLoading } = useQuery({
    queryKey: ['system-role', id],
    queryFn: () => systemRolesService.getById(id!),
    enabled: isEditMode && isReady && !!id && !isEmbedded,
  });

  // Set breadcrumb title (only in standalone mode)
  useBreadcrumbTitle(isEditMode && !isEmbedded ? roleData?.roleName : null);

  // Populate form in edit mode (standalone only)
  useEffect(() => {
    if (roleData && isEditMode && !isEmbedded) {
      reset({
        roleName: roleData.roleName || '',
        roleShortCode: roleData.roleShortCode || '',
        description: roleData.description || '',
        roleBinding: roleData.roleBinding || [],
      });
    }
  }, [roleData, isEditMode, isEmbedded, reset]);

  // Get roles for selected module
  const getRolesForModule = (moduleId: string) => {
    const module = modulesWithRoles.find((m) => m.moduleId === moduleId);
    return module?.roles || [];
  };

  // Handle role selection change
  const handleRoleChange = (index: number, roleId: string, moduleId: string) => {
    const module = modulesWithRoles.find((m) => m.moduleId === moduleId);
    const role = module?.roles.find((r) => r.roleId === roleId);
    if (role) {
      setValue(`roleBinding.${index}.roleId`, roleId);
      setValue(`roleBinding.${index}.roleName`, role.roleName);
      // Clear validation error for this field
      clearErrors(`roleBinding.${index}.roleId`);
    }
  };

  // Handle module selection from MultiSelect
  const handleModuleSelection = (selectedModuleIds: string[]) => {
    const currentRoleBindings = watch('roleBinding') || [];
    const currentModuleIds = currentRoleBindings.map(p => p.moduleId);

    // Find modules to add
    const modulesToAdd = selectedModuleIds.filter(id => !currentModuleIds.includes(id));
    // Find modules to remove
    const modulesToRemove = currentModuleIds.filter(id => !selectedModuleIds.includes(id));

    // Collect indices of modules to remove
    const indicesToRemove: number[] = [];
    modulesToRemove.forEach(moduleId => {
      const index = currentRoleBindings.findIndex(p => p.moduleId === moduleId);
      if (index !== -1) {
        indicesToRemove.push(index);
      }
    });

    // Remove in reverse order to maintain correct indices
    indicesToRemove.sort((a, b) => b - a).forEach(index => {
      remove(index);
    });

    // Add newly selected modules
    modulesToAdd.forEach(moduleId => {
      const module = modulesWithRoles.find(m => m.moduleId === moduleId);
      if (module) {
        append({
          moduleId: module.moduleId,
          moduleName: module.moduleName,
          roleId: '',
          roleName: '',
        });
      }
    });
  };

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: (data: SystemRoleFormData) => {
      const payload = {
        roleName: data.roleName,
        roleShortCode: data.roleShortCode,
        description: data.description || undefined,
        roleBinding: data.roleBinding,
      };

      if (isEditMode && id) {
        return systemRolesService.update(id, payload);
      }
      return systemRolesService.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-roles'] });

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `System role ${isEditMode ? 'updated' : 'created'} successfully`,
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
        `Failed to ${isEditMode ? 'update' : 'create'} system role`
      );

      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 10000,
      });
    },
  });

  // Handle form validation errors
  const onFormError = (errors: Record<string, unknown>) => {
    console.log('Form validation errors:', errors);
    // Frontend validation errors are shown inline as helper text
    // No toast message needed for frontend validation
  };

  // Form submission
  const onSubmit = async (data: SystemRoleFormData) => {
    // Validate no duplicate modules
    const moduleIds = data.roleBinding.map((p) => p.moduleId);
    const uniqueModuleIds = new Set(moduleIds);
    if (moduleIds.length !== uniqueModuleIds.size) {
      toast.current?.show({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Each module can only be assigned once',
        life: 10000,
      });
      return;
    }

    await mutation.mutateAsync(data);
  };

  // Handle cancel
  const handleCancel = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    handleNavigate('/system-roles');
  };

  const isSaving = mutation.isPending;
  const isLoading = (roleLoading && !isEmbedded) || modulesLoading;

  // Loading state
  if (isLoading) {
    return (
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900 flex justify-center items-center">
        <LoadingSpinner size="50px" />
      </div>
    );
  }

  // Get selected module IDs for MultiSelect value
  const selectedModuleIds = fields.map(f => {
    const perm = watch(`roleBinding.${fields.indexOf(f)}`);
    return perm?.moduleId;
  }).filter(Boolean);

  // Module options for MultiSelect
  const moduleOptions = modulesWithRoles.map((m) => ({
    value: m.moduleId,
    label: m.moduleName,
  }));

  // Embedded mode: render only the form fields without page wrapper
  if (isEmbedded) {
    return (
      <div>
        <Toast ref={toast} position="top-right" />

        {/* Basic Information Section */}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Basic Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Controller
              name="roleName"
              control={control}
              render={({ field }) => (
                <FormInput
                  {...field}
                  value={field.value || ''}
                  label="Role Name"
                  placeholder="Enter role name"
                  required
                  error={!!errors.roleName}
                  helperText={errors.roleName?.message}
                  autoFocus
                />
              )}
            />

            <Controller
              name="roleShortCode"
              control={control}
              render={({ field }) => (
                <FormInput
                  {...field}
                  value={field.value || ''}
                  label="Short Code"
                  placeholder="e.g., ADMIN"
                  required
                  error={!!errors.roleShortCode}
                  helperText={errors.roleShortCode?.message}
                />
              )}
            />

            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <FormInput
                  {...field}
                  value={field.value || ''}
                  label="Description"
                  placeholder="Optional description"
                  error={!!errors.description}
                  helperText={errors.description?.message}
                />
              )}
            />
          </div>
        </div>

        {/* Permissions Section */}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Module Permissions
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Select modules and assign roles. You can select multiple modules at once.
          </p>

          {errors.roleBinding && typeof errors.roleBinding.message === 'string' && (
            <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <i className="pi pi-exclamation-circle" />
              {errors.roleBinding.message}
            </div>
          )}

          <div className="mb-3">
            <MultiSelect
              value={selectedModuleIds}
              options={moduleOptions}
              onChange={(newValue) => handleModuleSelection(newValue as string[])}
              label="Select Modules"
              required
              placeholder="Select modules..."
              display="chip"
              filter
              showClear
              error={errors.roleBinding?.message}
            />
          </div>

          {/* Role Binding Table */}
          {fields.length > 0 ? (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-visible">
              <div className="bg-gray-50 dark:bg-gray-800 hidden lg:grid grid-cols-[150px_600px_auto_50px] gap-3 p-2 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                <span>Module</span>
                <span>Role</span>
                <span></span>
                <span></span>
              </div>
              {fields.map((field, index) => {
                const currentRoleBinding = watch(`roleBinding.${index}`);
                const availableRoles = getRolesForModule(currentRoleBinding?.moduleId || '');

                return (
                  <div key={field.id} className="grid grid-cols-[auto_1fr_auto] lg:grid-cols-[150px_600px_auto_50px] gap-2 p-2 border-t border-gray-200 dark:border-gray-700 items-start">
                    <div className="pt-2">
                      <Tag
                        value={currentRoleBinding?.moduleName || 'Unknown'}
                        icon="pi pi-box"
                        severity="info"
                      />
                    </div>
                    <div className={styles.roleDropdown}>
                      <Controller
                        name={`roleBinding.${index}.roleId`}
                        control={control}
                        render={({ field: roleField }) => (
                          <>
                            <Dropdown
                              {...roleField}
                              value={roleField.value || ''}
                              onChange={(e: any) =>
                                handleRoleChange(index, e.value, currentRoleBinding?.moduleId || '')
                              }
                              options={availableRoles.map((r) => ({
                                value: r.roleId,
                                label: `${r.roleName} (${r.roleShortCode})`,
                              }))}
                              placeholder="Select role"
                              invalid={!!errors.roleBinding?.[index]?.roleId}
                              filter
                              filterPlaceholder="Search..."
                              appendTo={document.body}
                            />
                            {errors.roleBinding?.[index]?.roleId && (
                              <span className="text-red-500 text-xs mt-1 block">
                                {errors.roleBinding[index].roleId.message}
                              </span>
                            )}
                          </>
                        )}
                      />
                    </div>
                    <div className="hidden lg:block"></div>
                    <div className="flex items-center lg:h-[42px] justify-center">
                      <Button
                        type="button"
                        icon="pi pi-times"
                        rounded
                        text
                        severity="danger"
                        onClick={() => remove(index)}
                        tooltip="Remove"
                        tooltipOptions={{ position: 'top' }}
                        style={{ width: '2rem', height: '2rem' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <i className="pi pi-shield text-4xl mb-2" />
              <p className="text-sm font-medium">No modules selected</p>
              <p className="text-xs">Use the dropdown above to select modules and assign roles.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Standalone mode: full page without FormCard (matching unit form)
  return (
    <PermissionGuard jobName={JOB_NAMES.SYSTEM_ROLES}>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900">
        {/* Header - Compact (matching Unit Form) */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
            >
              <i className="pi pi-arrow-left text-lg" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isEditMode ? 'Edit System Role' : 'Create New System Role'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditMode ? 'Update system role information and permissions' : 'Fill in the details below'}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit as any, onFormError)} noValidate>
          {/* Main Form Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">

            {/* Section: Basic Information */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Basic Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Controller
                  name="roleName"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="Role Name"
                      placeholder="Enter role name"
                      required
                      error={!!errors.roleName}
                      helperText={errors.roleName?.message}
                      autoFocus={!isEditMode}
                    />
                  )}
                />

                <Controller
                  name="roleShortCode"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="Short Code"
                      placeholder="e.g., ADMIN"
                      required
                      error={!!errors.roleShortCode}
                      helperText={errors.roleShortCode?.message}
                    />
                  )}
                />

                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="Description"
                      placeholder="Optional description"
                      error={!!errors.description}
                      helperText={errors.description?.message}
                    />
                  )}
                />
              </div>
            </div>

            {/* Section: Permissions */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Module Permissions
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Select modules and assign roles. You can select multiple modules at once.
              </p>

              {errors.roleBinding && typeof errors.roleBinding.message === 'string' && (
                <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                  <i className="pi pi-exclamation-circle" />
                  {errors.roleBinding.message}
                </div>
              )}

              <div className="mb-3">
                <MultiSelect
                  value={selectedModuleIds}
                  options={moduleOptions}
                  onChange={(newValue) => handleModuleSelection(newValue as string[])}
                  label="Select Modules"
                  required
                  placeholder="Select modules..."
                  display="chip"
                  filter
                  showClear
                  error={errors.roleBinding?.message}
                />
              </div>

              {/* Role Binding Table */}
              {fields.length > 0 ? (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-visible">
                  <div className="bg-gray-50 dark:bg-gray-800 hidden lg:grid grid-cols-[150px_600px_auto_50px] gap-3 p-2 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    <span>Module</span>
                    <span>Role</span>
                    <span></span>
                    <span></span>
                  </div>
                  {fields.map((field, index) => {
                    const currentRoleBinding = watch(`roleBinding.${index}`);
                    const availableRoles = getRolesForModule(currentRoleBinding?.moduleId || '');

                    return (
                      <div key={field.id} className="grid grid-cols-[auto_1fr_auto] lg:grid-cols-[150px_600px_auto_50px] gap-2 p-2 border-t border-gray-200 dark:border-gray-700 items-start">
                        <div className="pt-2">
                          <Tag
                            value={currentRoleBinding?.moduleName || 'Unknown'}
                            icon="pi pi-box"
                            severity="info"
                          />
                        </div>
                        <div className={styles.roleDropdown}>
                          <Controller
                            name={`roleBinding.${index}.roleId`}
                            control={control}
                            render={({ field: roleField }) => (
                              <>
                                <Dropdown
                                  {...roleField}
                                  value={roleField.value || ''}
                                  onChange={(e: any) =>
                                    handleRoleChange(index, e.value, currentRoleBinding?.moduleId || '')
                                  }
                                  options={availableRoles.map((r) => ({
                                    value: r.roleId,
                                    label: `${r.roleName} (${r.roleShortCode})`,
                                  }))}
                                  placeholder="Select role"
                                  invalid={!!errors.roleBinding?.[index]?.roleId}
                                  filter
                                  filterPlaceholder="Search..."
                                  appendTo={document.body}
                                />
                                {errors.roleBinding?.[index]?.roleId && (
                                  <span className="text-red-500 text-xs mt-1 block">
                                    {errors.roleBinding[index].roleId.message}
                                  </span>
                                )}
                              </>
                            )}
                          />
                        </div>
                        <div className="hidden lg:block"></div>
                        <div className="flex items-center lg:h-[42px] justify-center">
                          <Button
                            type="button"
                            icon="pi pi-times"
                            rounded
                            text
                            severity="danger"
                            onClick={() => remove(index)}
                            tooltip="Remove"
                            tooltipOptions={{ position: 'top' }}
                            style={{ width: '2rem', height: '2rem' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <i className="pi pi-shield text-4xl mb-2" />
                  <p className="text-sm font-medium">No modules selected</p>
                  <p className="text-xs">Use the dropdown above to select modules and assign roles.</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="p-4 flex justify-end gap-3">
              <Button
                type="button"
                label="Cancel"
                severity="secondary"
                outlined
                onClick={handleCancel}
                disabled={isSaving}
              />
              <Button
                type="button"
                label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
                icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
                disabled={isSaving}
                onClick={() => {
                  console.log('Submit button clicked');
                  handleSubmit(onSubmit as any, onFormError)();
                }}
              />
            </div>
          </div>
        </form>
      </div>

      {/* Leave Confirmation Dialog - only in standalone mode */}
      {!isEmbedded && (
        <DiscardChangesDialog
          visible={showLeaveDialog}
          onStay={cancelLeave}
          onLeave={confirmLeave}
          testId="SystemRoleForm.Dialog.Leave"
        />
      )}
    </PermissionGuard>
  );
});

// Set display name for debugging
SystemRoleFormInner.displayName = 'SystemRoleFormInner';

// Default export wrapper for standalone usage
const SystemRoleForm = (props: SystemRoleFormProps) => <SystemRoleFormInner {...props} />;

export default SystemRoleForm;

// Named export for embedded usage with ref
export { SystemRoleFormInner as EmbeddedSystemRoleForm };
