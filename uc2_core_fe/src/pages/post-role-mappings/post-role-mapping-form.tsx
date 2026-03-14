/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { RadioButton } from 'primereact/radiobutton';
// Commented out - only needed when Additional/Exclusion Permissions sections are enabled
// import { Accordion, AccordionTab } from 'primereact/accordion';
// import { Tag } from 'primereact/tag';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
// Commented out - only needed when Additional/Exclusion Permissions sections are enabled
// import { Checkbox } from 'mainFe/Checkbox';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import FormSearchableSelect from '../../components/forms/form-searchable-select';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import { postRoleMappingsService } from '../../services/post-role-mappings.service';
import { systemRolesService } from '../../services/system-roles.service';
import { postsService } from '../../services/posts.service';
import { fetchModuleHierarchy, type ModuleHierarchy } from '../../services/roles.service';
import { extractErrorMessage } from '../../utils/error-handler';
import type {
  PostRoleMappingModule,
  CreateSystemRoleData
} from '../../types/post-role-mapping.types';
import type { SystemRole } from '../../types/system-role.types';
import { EmbeddedSystemRoleForm, type SystemRoleFormData, type SystemRoleFormRef } from '../system-roles/system-role-form';

/**
 * Validation Schema - Zod
 */
const systemRolePermissionSchema = z.object({
  moduleId: z.string().min(1, 'Module is required'),
  moduleName: z.string(),
  roleId: z.string().min(1, 'Role is required'),
  roleName: z.string(),
});

const permissionItemSchema = z.object({
  name: z.string(),
  isSelf: z.boolean(),
});

const jobSchema = z.object({
  jobName: z.string(),
  permissions: z.array(permissionItemSchema),
});

const modulePermissionSchema = z.object({
  moduleId: z.string(),
  moduleName: z.string(),
  jobs: z.array(jobSchema),
});

const postRoleMappingSchema = z.object({
  postId: z.string().min(1, 'Post is required'),
  isCreate: z.boolean(),

  // For existing system role
  systemRoleId: z.string().optional(),

  // For new system role
  roleName: z.string().max(120).optional(),
  roleShortCode: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
  systemRolePermissions: z.array(systemRolePermissionSchema).optional(),

  // Additional/Exclusion permissions
  additionalPermissions: z.array(modulePermissionSchema).optional(),
  exclusionPermissions: z.array(modulePermissionSchema).optional(),
}).refine((data) => {
  if (data.isCreate) {
    return data.roleName && data.roleName.trim().length > 0 &&
           data.roleShortCode && data.roleShortCode.trim().length > 0 &&
           data.systemRolePermissions && data.systemRolePermissions.length > 0;
  } else {
    return data.systemRoleId && data.systemRoleId.length > 0;
  }
}, {
  message: 'System role configuration is required',
  path: ['isCreate'],
});

type FormData = z.infer<typeof postRoleMappingSchema>;

// -----------------------------------------------------------------------------
// Component Props Interface
// -----------------------------------------------------------------------------

interface PostRoleMappingFormProps {
  /** When true, renders in modal-friendly mode (no back button, uses callbacks) */
  isModal?: boolean;
  /** Pre-selected post ID (for modal mode) */
  modalPostId?: string;
  /** Pre-selected post name (for modal mode) */
  modalPostName?: string;
  /** Pre-selected unit name (for modal mode display) */
  modalUnitName?: string;
  /** Callback when mapping is created successfully (for modal mode) */
  onSuccess?: () => void;
  /** Callback when cancel is clicked (for modal mode) */
  onCancel?: () => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const PostRoleMappingForm = ({
  isModal = false,
  modalPostId,
  modalPostName,
  modalUnitName,
  onSuccess,
  onCancel,
}: PostRoleMappingFormProps) => {
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'post-role-mappings',
    basePath: '/post-role-mappings',
  });
  const isEditMode = Boolean(id) && !isModal; // In modal mode, we're always creating
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.POST_ROLE_MAPPINGS);
  const canUpdate = useCanUpdate(JOB_NAMES.POST_ROLE_MAPPINGS);
  const hasPermission = isEditMode ? canUpdate : canCreate;

  // Module hierarchy for additional/exclusion permissions
  const [moduleHierarchy, setModuleHierarchy] = useState<ModuleHierarchy[]>([]);
  const [loadingModuleHierarchy, setLoadingModuleHierarchy] = useState(true);

  // Additional/Exclusion permission states
  const [additionalPerms, setAdditionalPerms] = useState<Map<string, Set<string>>>(new Map());
  const [exclusionPerms, setExclusionPerms] = useState<Map<string, Set<string>>>(new Map());

  // Ref for embedded SystemRoleForm (for "Create New System Role" mode)
  const systemRoleFormRef = useRef<SystemRoleFormRef>(null);
  const [embeddedSystemRoleData, setEmbeddedSystemRoleData] = useState<SystemRoleFormData | null>(null);
  const [embeddedSystemRoleValid, setEmbeddedSystemRoleValid] = useState(false);

  // Form setup - in modal mode, pre-select the post and default to "Use Existing System Role"
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(postRoleMappingSchema) as any,
    defaultValues: {
      postId: isModal ? (modalPostId || '') : '',
      isCreate: isModal ? false : true, // In modal mode, default to using existing system role
      systemRoleId: '',
      roleName: '',
      roleShortCode: '',
      description: '',
      systemRolePermissions: [],
      additionalPermissions: [],
      exclusionPermissions: [],
    },
    mode: 'onChange',
  });

  // Callback for embedded SystemRoleForm data changes
  const handleSystemRoleFormDataChange = (data: SystemRoleFormData, isValid: boolean) => {
    setEmbeddedSystemRoleData(data);
    setEmbeddedSystemRoleValid(isValid);
  };

  // Navigation blocker - disabled in modal mode since we handle it differently
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } =
    useNavigationBlocker({ when: isDirty && !isModal });

  const isCreateMode = watch('isCreate');

  // Fetch posts for dropdown
  const { data: posts = [], isLoading: postsLoading, error: postsError } = useQuery({
    queryKey: ['posts', 'dropdown'],
    queryFn: async () => {
      const result = await postsService.getAllForDropdown();
      console.log('[PostRoleMappingForm] Posts API response:', result);
      return result;
    },
  });

  // Fetch system roles for dropdown
  const { data: systemRoles = [], isLoading: systemRolesLoading, error: systemRolesError } = useQuery({
    queryKey: ['system-roles', 'dropdown'],
    queryFn: async () => {
      const result = await systemRolesService.getAllForDropdown();
      console.log('[PostRoleMappingForm] System Roles API response:', result);
      return result;
    },
  });

  // Debug: Log errors and data
  console.log('[PostRoleMappingForm] Posts:', posts, 'Error:', postsError);
  console.log('[PostRoleMappingForm] System Roles:', systemRoles, 'Error:', systemRolesError);

  // Fetch module hierarchy for additional/exclusion permissions
  useEffect(() => {
    const loadModuleHierarchy = async () => {
      try {
        setLoadingModuleHierarchy(true);
        const data = await fetchModuleHierarchy();
        setModuleHierarchy(data);
      } catch (err) {
        console.error('Failed to load module hierarchy:', err);
      } finally {
        setLoadingModuleHierarchy(false);
      }
    };
    loadModuleHierarchy();
  }, []);

  // Fetch mapping data for edit mode
  const { data: mappingData, isLoading: mappingLoading } = useQuery({
    queryKey: ['post-role-mapping', id],
    queryFn: () => postRoleMappingsService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title
  useBreadcrumbTitle(isEditMode ? mappingData?.postName : null);

  // Populate form in edit mode
  useEffect(() => {
    if (mappingData && isEditMode) {
      // In edit mode, we always work with the existing system role
      reset({
        postId: mappingData.postId || '',
        isCreate: false, // Edit mode always uses existing
        systemRoleId: mappingData.systemRoleId || '',
        roleName: mappingData.systemRoleData?.roleName || '',
        roleShortCode: mappingData.systemRoleData?.roleShortCode || '',
        description: mappingData.systemRoleData?.description || '',
        systemRolePermissions: mappingData.systemRoleData?.roleBinding?.map(p => ({
          moduleId: p.moduleId,
          moduleName: p.moduleName,
          roleId: p.roleId,
          roleName: p.roleName,
        })) || [],
        additionalPermissions: mappingData.additionalPermissions || [],
        exclusionPermissions: mappingData.exclusionPermissions || [],
      });

      // Populate additional permissions map
      const additionalMap = new Map<string, Set<string>>();
      mappingData.additionalPermissions?.forEach(module => {
        module.jobs.forEach(job => {
          const key = `${module.moduleId}-${job.jobName}`;
          const perms = new Set(job.permissions.map(p => p.name));
          additionalMap.set(key, perms);
        });
      });
      setAdditionalPerms(additionalMap);

      // Populate exclusion permissions map
      const exclusionMap = new Map<string, Set<string>>();
      mappingData.exclusionPermissions?.forEach(module => {
        module.jobs.forEach(job => {
          const key = `${module.moduleId}-${job.jobName}`;
          const perms = new Set(job.permissions.map(p => p.name));
          exclusionMap.set(key, perms);
        });
      });
      setExclusionPerms(exclusionMap);
    }
  }, [mappingData, isEditMode, reset]);

  // Post options - simple label without unit name (unit shown separately)
  const postOptions = useMemo(
    () => posts.map((p: any) => ({
      value: p._id,
      label: `${p.postName} (${p.postCode})`,
    })),
    [posts]
  );

  // Get selected post's unit name
  const selectedPostId = watch('postId');
  const selectedPostUnitName = useMemo(() => {
    if (!selectedPostId) return null;
    const selectedPost = posts.find((p: any) => p._id === selectedPostId);
    return selectedPost?.unitName || null;
  }, [selectedPostId, posts]);

  // System role options
  const systemRoleOptions = useMemo(
    () => systemRoles.map((r: SystemRole) => ({
      value: r._id,
      label: `${r.roleName} (${r.roleShortCode})`,
    })),
    [systemRoles]
  );

  // Toggle permission in additional/exclusion - Commented out since permissions sections are disabled
  /*
  const togglePermission = (
    type: 'additional' | 'exclusion',
    moduleId: string,
    jobName: string,
    permissionName: string
  ) => {
    const key = `${moduleId}-${jobName}`;
    const setPerms = type === 'additional' ? setAdditionalPerms : setExclusionPerms;
    const currentMap = type === 'additional' ? additionalPerms : exclusionPerms;

    setPerms(prev => {
      const newMap = new Map(prev);
      const jobPerms = new Set(newMap.get(key) || []);

      if (jobPerms.has(permissionName)) {
        jobPerms.delete(permissionName);
      } else {
        jobPerms.add(permissionName);
      }

      if (jobPerms.size === 0) {
        newMap.delete(key);
      } else {
        newMap.set(key, jobPerms);
      }

      return newMap;
    });
  };
  */

  // Convert permissions map to array format
  const permsMapToArray = (permsMap: Map<string, Set<string>>): PostRoleMappingModule[] => {
    const moduleMap = new Map<string, PostRoleMappingModule>();

    permsMap.forEach((permissions, key) => {
      const [moduleId, jobName] = key.split('-');
      const module = moduleHierarchy.find(m => m.moduleId === moduleId);

      if (!module) return;

      if (!moduleMap.has(moduleId)) {
        moduleMap.set(moduleId, {
          moduleId,
          moduleName: module.moduleName,
          jobs: [],
        });
      }

      const moduleEntry = moduleMap.get(moduleId)!;
      moduleEntry.jobs.push({
        jobName,
        permissions: Array.from(permissions).map(name => ({ name, isSelf: false })),
      });
    });

    return Array.from(moduleMap.values());
  };

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const additionalPermissions = permsMapToArray(additionalPerms);
      const exclusionPermissions = permsMapToArray(exclusionPerms);

      if (isEditMode && id) {
        // Update - use embedded form data for system role
        const systemRoleData: CreateSystemRoleData | undefined = embeddedSystemRoleData ? {
          roleName: embeddedSystemRoleData.roleName || '',
          roleShortCode: embeddedSystemRoleData.roleShortCode || '',
          description: embeddedSystemRoleData.description,
          roleBinding: embeddedSystemRoleData.roleBinding || [],
        } : undefined;

        return postRoleMappingsService.update(id, {
          postId: data.postId,
          systemRoleData,
          additionalPermissions,
          exclusionPermissions,
        });
      }

      // Create
      if (data.isCreate) {
        // Create new system role - use embedded form data
        if (!embeddedSystemRoleData) {
          throw new Error('System role data is required');
        }
        return postRoleMappingsService.create({
          postId: data.postId,
          isCreate: true,
          systemRoleData: {
            roleName: embeddedSystemRoleData.roleName || '',
            roleShortCode: embeddedSystemRoleData.roleShortCode || '',
            description: embeddedSystemRoleData.description,
            roleBinding: embeddedSystemRoleData.roleBinding || [],
          },
          additionalPermissions,
          exclusionPermissions,
        });
      } else {
        // Use existing system role
        return postRoleMappingsService.create({
          postId: data.postId,
          isCreate: false,
          systemRoleId: data.systemRoleId,
          additionalPermissions,
          exclusionPermissions,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-role-mappings'] });

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Post role mapping ${isEditMode ? 'updated' : 'created'} successfully`,
        life: 3000,
      });

      if (isModal && onSuccess) {
        // In modal mode, call the onSuccess callback after a brief delay for toast visibility
        setTimeout(() => onSuccess(), 800);
      } else {
        setTimeout(() => {
          navigateToList();
        }, 1000);
      }
    },
    onError: (error: any) => {
      console.error('Error response:', error.response);

      const errorMessage = extractErrorMessage(
        error,
        `Failed to ${isEditMode ? 'update' : 'create'} post role mapping`
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

    toast.current?.show({
      severity: 'error',
      summary: 'Validation Error',
      detail: 'Please fill in all required fields',
      life: 10000,
    });
  };

  // Form submission
  const onSubmit = async (data: FormData) => {
    // If creating new system role, validate the embedded form first
    if (data.isCreate || isEditMode) {
      // Trigger validation on embedded form
      const isEmbeddedValid = await systemRoleFormRef.current?.triggerValidation();
      if (!isEmbeddedValid) {
        toast.current?.show({
          severity: 'error',
          summary: 'Validation Error',
          detail: 'Please fill in all required system role fields',
          life: 10000,
        });
        return;
      }
    }
    await mutation.mutateAsync(data);
  };

  // Handle cancel
  const handleCancel = () => {
    if (isModal && onCancel) {
      onCancel();
    } else {
      handleNavigate('/post-role-mappings');
    }
  };

  const isSaving = mutation.isPending;
  const isLoading = mappingLoading || postsLoading || systemRolesLoading || loadingModuleHierarchy;

  if (isLoading) {
    return (
      <div className={isModal ? "py-4 flex justify-center items-center" : "py-8 px-6 bg-gray-50 dark:bg-gray-900 flex justify-center items-center"}>
        <ProgressSpinner style={{ width: '50px', height: '50px' }} />
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.POST_ROLE_MAPPINGS}>
      <Toast ref={toast} position="top-right" />
      <div className={isModal ? "py-2" : "py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900"}>
        {/* Header - Hidden in modal mode since Dialog has its own header */}
        {!isModal && (
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleCancel}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
              >
                <i className="pi pi-arrow-left text-lg" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {isEditMode ? 'Edit Post Role Mapping' : 'Create Post Role Mapping'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isEditMode ? 'Update post role mapping configuration' : 'Map a post to a system role with optional permission customizations'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Show post info in modal mode */}
        {isModal && modalPostName && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-4">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Post
            </label>
            <div className="flex items-center gap-2">
              <i className="pi pi-briefcase text-blue-500" />
              <span className="font-medium text-gray-900 dark:text-white">
                {modalPostName}
              </span>
            </div>
            {modalUnitName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Unit: {modalUnitName}
              </p>
            )}
          </div>
        )}

        {/* Form */}
        <form
          id="post-role-mapping-form"
          onSubmit={handleSubmit(onSubmit as any, onFormError)}
          noValidate
        >
          {/* Step 1: Select Post - Hidden in modal mode since post is pre-selected */}
          {!isModal && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Step 1: Select Post
                </h2>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Controller
                    name="postId"
                    control={control}
                    render={({ field }) => (
                      <FormSearchableSelect
                        {...field}
                        label="Post"
                        initialOptions={postOptions}
                        onSearch={async (searchTerm) => {
                          // Filter options locally
                          const term = searchTerm.toLowerCase();
                          return postOptions.filter(opt =>
                            opt.label.toLowerCase().includes(term)
                          );
                        }}
                        placeholder="Search and select a post..."
                        required
                        disabled={isEditMode}
                        error={!!errors.postId}
                        helperText={errors.postId?.message as string}
                      />
                    )}
                  />

                  {/* Unit Name - Read-only display field styled like float label input */}
                  <div className="relative">
                    <div className={`flex items-center gap-2 px-3 pt-4 pb-2 h-[54px] rounded-md border ${
                      selectedPostUnitName
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                    }`}>
                      <i className={`pi pi-building ${selectedPostUnitName ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} />
                      <span className={`text-sm ${
                        selectedPostUnitName
                          ? 'text-gray-900 dark:text-white'
                          : 'text-gray-500 dark:text-gray-400 italic'
                      }`}>
                        {selectedPostUnitName || 'Select a post to see its unit'}
                      </span>
                    </div>
                    <label className={`absolute left-3 top-1 text-xs font-medium ${
                      selectedPostUnitName
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      Unit
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: System Role Configuration */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Step 2: System Role Configuration
              </h2>
            </div>
            <div className="p-4">
              {/* Radio buttons for create/existing - only in create mode */}
              {!isEditMode && (
                <div className="flex gap-6 mb-4">
                  <Controller
                    name="isCreate"
                    control={control}
                    render={({ field }) => (
                      <>
                        <div className="flex items-center gap-2">
                          <RadioButton
                            inputId="createNew"
                            value={true}
                            onChange={(e) => field.onChange(e.value)}
                            checked={field.value === true}
                          />
                          <label htmlFor="createNew" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                            Create New System Role
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioButton
                            inputId="useExisting"
                            value={false}
                            onChange={(e) => field.onChange(e.value)}
                            checked={field.value === false}
                          />
                          <label htmlFor="useExisting" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                            Use Existing System Role
                          </label>
                        </div>
                      </>
                    )}
                  />
                </div>
              )}

              {/* Create New System Role Section - Using Embedded SystemRoleForm */}
              {(isCreateMode || isEditMode) && (
                <div className="space-y-4">
                  <EmbeddedSystemRoleForm
                    ref={systemRoleFormRef}
                    isEmbedded
                    onFormDataChange={handleSystemRoleFormDataChange}
                    initialData={isEditMode && mappingData?.systemRoleData ? {
                      roleName: mappingData.systemRoleData.roleName || '',
                      roleShortCode: mappingData.systemRoleData.roleShortCode || '',
                      description: mappingData.systemRoleData.description || '',
                      roleBinding: mappingData.systemRoleData.roleBinding?.map(p => ({
                        moduleId: p.moduleId,
                        moduleName: p.moduleName,
                        roleId: p.roleId,
                        roleName: p.roleName,
                      })) || [],
                    } : undefined}
                  />

                  {isEditMode && (
                    <Message
                      severity="warn"
                      text="If this system role is used by other posts, a new system role will be created automatically."
                      className="w-full mt-4"
                    />
                  )}
                </div>
              )}

              {/* Use Existing System Role Section */}
              {!isCreateMode && !isEditMode && (
                <div className="mt-4">
                  <Controller
                    name="systemRoleId"
                    control={control}
                    render={({ field }) => (
                      <FormSearchableSelect
                        {...field}
                        label="System Role"
                        initialOptions={systemRoleOptions}
                        onSearch={async (searchTerm) => {
                          // Filter options locally
                          const term = searchTerm.toLowerCase();
                          return systemRoleOptions.filter(opt =>
                            opt.label.toLowerCase().includes(term)
                          );
                        }}
                        placeholder="Search and select a system role..."
                        required
                        error={!!errors.systemRoleId}
                        helperText={errors.systemRoleId?.message as string}
                      />
                    )}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Step 3 & 4: Additional and Exclusion Permissions - COMMENTED OUT FOR NOW */}
          {/*
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
            <Accordion multiple className="step-accordion">
              <AccordionTab
                header={
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3">
                      <i className="pi pi-plus-circle text-green-500 text-lg" />
                      <div>
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          Step 3: Additional Permissions (Optional)
                        </span>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          Add extra permissions beyond the system role
                        </p>
                      </div>
                    </div>
                    {additionalPerms.size > 0 && (
                      <Tag
                        value={`${Array.from(additionalPerms.values()).reduce((sum, set) => sum + set.size, 0)} permissions selected`}
                        severity="success"
                        className="text-xs"
                      />
                    )}
                  </div>
                }
              >
                <div className="p-4">
                  {moduleHierarchy.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading modules...</p>
                  ) : (
                    <Accordion multiple className="permissions-accordion">
                      {moduleHierarchy.map((module) => {
                        const moduleSelectedCount = module.jobs.reduce((count, job) => {
                          const jobKey = `${module.moduleId}-${job.name}`;
                          return count + (additionalPerms.get(jobKey)?.size || 0);
                        }, 0);

                        return (
                          <AccordionTab
                            key={module.moduleId}
                            header={
                              <div className="flex items-center justify-between w-full pr-4">
                                <div className="flex items-center gap-3">
                                  <i className="pi pi-box text-blue-500" />
                                  <span className="font-medium text-gray-800 dark:text-gray-200">
                                    {module.moduleName || 'Unknown Module'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Tag value={`${module.jobs.length} jobs`} severity="info" className="text-xs" />
                                  {moduleSelectedCount > 0 && (
                                    <Tag value={`${moduleSelectedCount} selected`} severity="success" className="text-xs" />
                                  )}
                                </div>
                              </div>
                            }
                          >
                            <div className="pt-2">
                              <Accordion multiple className="nested-accordion">
                                {module.jobs.map((job) => {
                                  const jobKey = `${module.moduleId}-${job.name}`;
                                  const selectedPerms = additionalPerms.get(jobKey) || new Set();

                                  return (
                                    <AccordionTab
                                      key={jobKey}
                                      header={
                                        <div className="flex items-center justify-between w-full pr-4">
                                          <div className="flex items-center gap-2">
                                            <i className="pi pi-briefcase text-blue-400" />
                                            <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
                                              {job.name}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Tag value={`${job.permissions.length} perms`} severity="secondary" className="text-xs" />
                                            {selectedPerms.size > 0 && (
                                              <Tag value={`${selectedPerms.size} selected`} severity="success" className="text-xs" />
                                            )}
                                          </div>
                                        </div>
                                      }
                                    >
                                      <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                                        <div className="flex flex-wrap gap-2">
                                          {job.permissions.map((perm) => {
                                            const isSelected = selectedPerms.has(perm.name);
                                            return (
                                              <div
                                                key={perm.name}
                                                onClick={() => togglePermission('additional', module.moduleId, job.name, perm.name)}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                                                  isSelected
                                                    ? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-700 dark:text-green-400'
                                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-green-300 hover:bg-green-50/50'
                                                }`}
                                              >
                                                <Checkbox
                                                  checked={isSelected}
                                                  onChange={() => togglePermission('additional', module.moduleId, job.name, perm.name)}
                                                />
                                                <span className="text-sm font-medium">{perm.name}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </AccordionTab>
                                  );
                                })}
                              </Accordion>
                            </div>
                          </AccordionTab>
                        );
                      })}
                    </Accordion>
                  )}
                </div>
              </AccordionTab>

              <AccordionTab
                header={
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3">
                      <i className="pi pi-minus-circle text-orange-500 text-lg" />
                      <div>
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          Step 4: Exclusion Permissions (Optional)
                        </span>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          Remove specific permissions from the system role
                        </p>
                      </div>
                    </div>
                    {exclusionPerms.size > 0 && (
                      <Tag
                        value={`${Array.from(exclusionPerms.values()).reduce((sum, set) => sum + set.size, 0)} permissions excluded`}
                        severity="warning"
                        className="text-xs"
                      />
                    )}
                  </div>
                }
              >
                <div className="p-4">
                  {moduleHierarchy.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading modules...</p>
                  ) : (
                    <Accordion multiple className="permissions-accordion">
                      {moduleHierarchy.map((module) => {
                        const moduleExcludedCount = module.jobs.reduce((count, job) => {
                          const jobKey = `${module.moduleId}-${job.name}`;
                          return count + (exclusionPerms.get(jobKey)?.size || 0);
                        }, 0);

                        return (
                          <AccordionTab
                            key={module.moduleId}
                            header={
                              <div className="flex items-center justify-between w-full pr-4">
                                <div className="flex items-center gap-3">
                                  <i className="pi pi-box text-orange-500" />
                                  <span className="font-medium text-gray-800 dark:text-gray-200">
                                    {module.moduleName || 'Unknown Module'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Tag value={`${module.jobs.length} jobs`} severity="info" className="text-xs" />
                                  {moduleExcludedCount > 0 && (
                                    <Tag value={`${moduleExcludedCount} excluded`} severity="warning" className="text-xs" />
                                  )}
                                </div>
                              </div>
                            }
                          >
                            <div className="pt-2">
                              <Accordion multiple className="nested-accordion">
                                {module.jobs.map((job) => {
                                  const jobKey = `${module.moduleId}-${job.name}`;
                                  const selectedPerms = exclusionPerms.get(jobKey) || new Set();

                                  return (
                                    <AccordionTab
                                      key={jobKey}
                                      header={
                                        <div className="flex items-center justify-between w-full pr-4">
                                          <div className="flex items-center gap-2">
                                            <i className="pi pi-briefcase text-orange-400" />
                                            <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
                                              {job.name}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Tag value={`${job.permissions.length} perms`} severity="secondary" className="text-xs" />
                                            {selectedPerms.size > 0 && (
                                              <Tag value={`${selectedPerms.size} excluded`} severity="warning" className="text-xs" />
                                            )}
                                          </div>
                                        </div>
                                      }
                                    >
                                      <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                                        <div className="flex flex-wrap gap-2">
                                          {job.permissions.map((perm) => {
                                            const isSelected = selectedPerms.has(perm.name);
                                            return (
                                              <div
                                                key={perm.name}
                                                onClick={() => togglePermission('exclusion', module.moduleId, job.name, perm.name)}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                                                  isSelected
                                                    ? 'bg-orange-50 dark:bg-orange-900/30 border-orange-500 text-orange-700 dark:text-orange-400'
                                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-orange-300 hover:bg-orange-50/50'
                                                }`}
                                              >
                                                <Checkbox
                                                  checked={isSelected}
                                                  onChange={() => togglePermission('exclusion', module.moduleId, job.name, perm.name)}
                                                />
                                                <span className="text-sm font-medium">{perm.name}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </AccordionTab>
                                  );
                                })}
                              </Accordion>
                            </div>
                          </AccordionTab>
                        );
                      })}
                    </Accordion>
                  )}
                </div>
              </AccordionTab>
            </Accordion>
          </div>
          */}

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              outlined
              onClick={handleCancel}
              disabled={isSaving}
            />
            <Button
              type="submit"
              label={isSaving ? 'Saving...' : isEditMode ? 'Update Mapping' : 'Create Mapping'}
              icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
              disabled={isSaving}
            />
          </div>
        </form>

        {/* Leave Confirmation Dialog - not shown in modal mode */}
        {!isModal && (
          <DiscardChangesDialog
            visible={showLeaveDialog}
            onStay={cancelLeave}
            onLeave={confirmLeave}
            testId="PostRoleMappingForm.Dialog.Leave"
          />
        )}
      </div>
    </PermissionGuard>
  );
};

export default PostRoleMappingForm;
