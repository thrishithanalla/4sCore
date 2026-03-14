/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tooltip } from 'primereact/tooltip';
import { Toast } from 'mainFe/Toast';
import { Input } from 'mainFe/Input';
import { TextArea } from 'mainFe/TextArea';
import { Dropdown } from 'mainFe/Dropdown';
import { Tag } from 'mainFe/Tag';
import { Checkbox } from 'mainFe/Checkbox';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import JobCreateDialog from '../../components/dialogs/job-create-dialog';
import PermissionCreateDialog from '../../components/dialogs/permission-create-dialog';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import styles from './role-form.module.css';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { useFormDirtyTracker } from '../../hooks/useFormDirtyTracker';
import {
  fetchModuleHierarchy,
  getJobsForSelectedModules,
  getRoleById,
  createRole,
  updateRole,
  type ModuleHierarchy,
} from '../../services/roles.service';
import { extractErrorMessage } from '../../utils/error-handler';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate } from '../../hooks/usePermissions';

interface FormData {
  name: string;
  shortCode: string;
  description: string;
  roleAccessFor: string[]; // moduleIds
}

interface RoleFormProps {
  dialogMode?: boolean;
  onSuccess?: (role: { _id: string; name: string }) => void;
  onCancel?: () => void;
}

// Standard permission order for consistent display (CRUD + Execute + Upload/Download)
const PERMISSION_ORDER: Record<string, number> = {
  create: 1,
  read: 2,
  update: 3,
  delete: 4,
  execute: 5,
  upload: 6,
  download: 7,
};

// Sort permissions in a consistent order
// Handles both string[] and { permissionId, name }[] formats from module-hierarchy API
const sortPermissions = (permissions: (string | { permissionId: string; name: string })[]): string[] => {
  // Extract permission names from objects if needed
  const permissionNames = permissions.map((p) => (typeof p === 'string' ? p : p.name));
  return [...permissionNames].sort((a, b) => {
    const orderA = PERMISSION_ORDER[a.toLowerCase()] ?? 100;
    const orderB = PERMISSION_ORDER[b.toLowerCase()] ?? 100;
    return orderA - orderB;
  });
};

// Helper to extract permission names from job.permissions array (handles both formats)
const getPermissionNames = (permissions: (string | { permissionId: string; name: string })[]): string[] => {
  return permissions.map((p) => (typeof p === 'string' ? p : p.name));
};

const RoleForm = ({ dialogMode = false, onSuccess, onCancel }: RoleFormProps) => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'roles',
    basePath: '/roles',
  });
  const isEditMode = !dialogMode && Boolean(id);
  const toast = useRef<Toast>(null);

  // Permission checks
  const canCreate = useCanCreate('roles');
  const canUpdate = useCanUpdate('roles');

  const [formData, setFormData] = useState<FormData>({
    name: '',
    shortCode: '',
    description: '',
    roleAccessFor: [],
  });

  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [selectedPermissions, setSelectedPermissions] = useState<Map<string, Set<string>>>(new Map());
  const [jobMenuSettings, setJobMenuSettings] = useState<Map<string, boolean>>(new Map()); // Track isMenu per job
  const [jobDisplayOrder, setJobDisplayOrder] = useState<Map<string, number>>(new Map()); // Track displayOrder per job
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [error, setError] = useState('');

  // Field-level validation errors
  const [fieldErrors, setFieldErrors] = useState({
    name: '',
    shortCode: '',
    roleAccessFor: '',
  });

  // Track dirty state for navigation blocking
  const { isDirty, setInitialValues, checkDirty } = useFormDirtyTracker();

  // Navigation blocker
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty && !dialogMode });

  // Set breadcrumb title to show role name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? formData.name : null);

  const [moduleHierarchy, setModuleHierarchy] = useState<ModuleHierarchy[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);

  // Collapsible state - using Sets for moduleIds and jobKeys
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  // Dialog states
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const loadModuleHierarchy = async () => {
    try {
      setLoadingModules(true);
      console.log('🔄 Fetching module hierarchy...');
      const data = await fetchModuleHierarchy();
      console.log('✅ Module hierarchy loaded:', data);
      setModuleHierarchy(data);
    } catch (err) {
      console.error('❌ Failed to load module hierarchy:', err);
      setError('Failed to load modules. Please check the console for details.');
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load modules',
        life: 10000
      });
    } finally {
      setLoadingModules(false);
      console.log('🏁 Module loading finished');
    }
  };

  useEffect(() => {
    loadModuleHierarchy();
  }, []);

  const openJobDialog = (moduleId: string) => {
    setActiveModuleId(moduleId);
    setJobDialogOpen(true);
  };

  const openPermissionDialog = (moduleId: string, jobId: string) => {
    setActiveModuleId(moduleId);
    setActiveJobId(jobId);
    setPermissionDialogOpen(true);
  };

  const handleJobCreated = async () => {
    // Refresh module hierarchy to show the newly created job
    loadModuleHierarchy();
  };

  const handlePermissionCreated = async () => {
    // Refresh module hierarchy to show the newly created permission
    loadModuleHierarchy();
    setPermissionDialogOpen(false);
    setActiveModuleId(null);
    setActiveJobId(null);
  };

  // Load role data in edit mode
  useEffect(() => {
    if (isEditMode && isReady && id && moduleHierarchy.length > 0) {
      const loadRole = async () => {
        try {
          const role = await getRoleById(id);
          const loadedFormData = {
            name: role.name,
            shortCode: role.shortCode,
            description: role.description,
            roleAccessFor: role.permissions.map((p) => p.moduleId),
          };
          setFormData(loadedFormData);

          const newSelectedJobs = new Set<string>();
          const newSelectedPermissions = new Map<string, Set<string>>();
          const newJobMenuSettings = new Map<string, boolean>();
          const newJobDisplayOrder = new Map<string, number>();
          const newExpandedModules = new Set<string>();
          const newExpandedJobs = new Set<string>();

          role.permissions.forEach((module) => {
            // Don't auto-expand modules - keep them collapsed for cleaner UI
            module.jobs.forEach((job) => {
              const jobKey = `${module.moduleId}-${job.jobName}`;
              newSelectedJobs.add(jobKey);
              // Don't auto-expand jobs - keep permissions hidden until clicked
              const permSet = new Set<string>();
              // Handle both string[] and {name, isSelf}[] formats for backward compatibility
              job.permissions.forEach((perm) => {
                const permName = typeof perm === 'string' ? perm : (perm as any).name;
                if (permName) permSet.add(permName);
              });
              newSelectedPermissions.set(jobKey, permSet);
              // Load isMenu setting (default to true if not specified)
              const isMenu = job.isMenu !== undefined ? job.isMenu : true;
              newJobMenuSettings.set(jobKey, isMenu);
              // Load displayOrder setting (default based on isMenu)
              const displayOrder = job.displayOrder !== undefined ? job.displayOrder : (isMenu ? 1 : 0);
              newJobDisplayOrder.set(jobKey, displayOrder);
            });
          });

          setSelectedJobs(newSelectedJobs);
          setSelectedPermissions(newSelectedPermissions);
          setJobMenuSettings(newJobMenuSettings);
          setJobDisplayOrder(newJobDisplayOrder);
          // Keep modules and jobs collapsed by default
          setExpandedModules(new Set());
          setExpandedJobs(new Set());

          // Store initial values for dirty checking
          setInitialValues({
            formData: loadedFormData,
            selectedJobs: newSelectedJobs,
            selectedPermissions: newSelectedPermissions,
          });
        } catch (err: any) {
          console.error('Failed to load role:', err);
          setError(extractErrorMessage(err, 'Failed to load role'));
        } finally {
          setInitialLoading(false);
        }
      };
      loadRole();
    } else if (!isEditMode) {
      // For create mode, store initial empty state
      setInitialValues({
        formData: { name: '', shortCode: '', description: '', roleAccessFor: [] },
        selectedJobs: new Set(),
        selectedPermissions: new Map(),
      });
    }
  }, [id, isReady, isEditMode, moduleHierarchy, setInitialValues]);

  // Track dirty state by comparing current values with initial values
  useEffect(() => {
    checkDirty({ formData, selectedJobs, selectedPermissions });
  }, [formData, selectedJobs, selectedPermissions, checkDirty]);

  const selectedModulesWithJobs = getJobsForSelectedModules(moduleHierarchy, formData.roleAccessFor);

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleRoleAccessChange = (selectedValues: string[]) => {
    const removedModules = formData.roleAccessFor.filter((m) => !selectedValues.includes(m));
    if (removedModules.length > 0) {
      const newSelectedJobs = new Set(selectedJobs);
      const newSelectedPermissions = new Map(selectedPermissions);
      const newExpandedModules = new Set(expandedModules);
      const newExpandedJobs = new Set(expandedJobs);

      removedModules.forEach((moduleId) => {
        newExpandedModules.delete(moduleId);
        Array.from(newSelectedJobs).forEach((jobKey) => {
          if (jobKey.startsWith(`${moduleId}-`)) {
            newSelectedJobs.delete(jobKey);
            newSelectedPermissions.delete(jobKey);
            newExpandedJobs.delete(jobKey);
          }
        });
      });

      setSelectedJobs(newSelectedJobs);
      setSelectedPermissions(newSelectedPermissions);
      setExpandedModules(newExpandedModules);
      setExpandedJobs(newExpandedJobs);
    }

    // Don't auto-expand newly added modules - keep UI clean
    setFormData((prev) => ({ ...prev, roleAccessFor: selectedValues }));
  };

  const toggleModuleExpand = (moduleId: string) => {
    setExpandedModules((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(moduleId)) newSet.delete(moduleId);
      else newSet.add(moduleId);
      return newSet;
    });
  };

  const toggleJobExpand = (jobKey: string) => {
    setExpandedJobs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(jobKey)) newSet.delete(jobKey);
      else newSet.add(jobKey);
      return newSet;
    });
  };

  const handleJobSelect = (jobKey: string, jobPermissions?: string[]) => {
    const newSelectedJobs = new Set(selectedJobs);
    const newPermissions = new Map(selectedPermissions);
    const newJobMenuSettings = new Map(jobMenuSettings);
    const newJobDisplayOrder = new Map(jobDisplayOrder);

    if (newSelectedJobs.has(jobKey)) {
      // Unchecking job - remove job and its permissions
      newSelectedJobs.delete(jobKey);
      newPermissions.delete(jobKey);
      newJobMenuSettings.delete(jobKey);
      newJobDisplayOrder.delete(jobKey);
    } else {
      // Checking job - add job and select all its permissions
      newSelectedJobs.add(jobKey);
      if (jobPermissions && jobPermissions.length > 0) {
        newPermissions.set(jobKey, new Set(jobPermissions));
      }
      // Set default isMenu to true for newly selected jobs
      newJobMenuSettings.set(jobKey, true);
      // Set default displayOrder to 1 for newly selected jobs (since isMenu is true)
      newJobDisplayOrder.set(jobKey, 1);
    }

    setSelectedJobs(newSelectedJobs);
    setSelectedPermissions(newPermissions);
    setJobMenuSettings(newJobMenuSettings);
    setJobDisplayOrder(newJobDisplayOrder);
  };

  // Handle isMenu toggle for a job
  const handleJobMenuToggle = (jobKey: string) => {
    const newJobMenuSettings = new Map(jobMenuSettings);
    const newJobDisplayOrder = new Map(jobDisplayOrder);
    const currentValue = newJobMenuSettings.get(jobKey) ?? true;
    const newIsMenu = !currentValue;
    newJobMenuSettings.set(jobKey, newIsMenu);
    // Set default displayOrder based on isMenu value
    if (newIsMenu) {
      // If turning on menu, set displayOrder to 1 if currently 0 or negative
      const currentOrder = newJobDisplayOrder.get(jobKey) ?? 0;
      if (currentOrder < 1) {
        newJobDisplayOrder.set(jobKey, 1);
      }
    } else {
      // If turning off menu, set displayOrder to 0
      newJobDisplayOrder.set(jobKey, 0);
    }
    setJobMenuSettings(newJobMenuSettings);
    setJobDisplayOrder(newJobDisplayOrder);
  };

  // Handle displayOrder change for a job
  const handleDisplayOrderChange = (jobKey: string, value: number) => {
    const newJobDisplayOrder = new Map(jobDisplayOrder);
    const newJobMenuSettings = new Map(jobMenuSettings);
    newJobDisplayOrder.set(jobKey, value);
    // Auto-update isMenu based on displayOrder value
    if (value >= 1) {
      newJobMenuSettings.set(jobKey, true);
    } else {
      newJobMenuSettings.set(jobKey, false);
    }
    setJobDisplayOrder(newJobDisplayOrder);
    setJobMenuSettings(newJobMenuSettings);
  };

  const handlePermissionToggle = (jobKey: string, permission: string) => {
    const newPermissions = new Map(selectedPermissions);
    const newSelectedJobs = new Set(selectedJobs);
    const jobPerms = new Set(newPermissions.get(jobKey) || []);

    // Find existing permission with case-insensitive match
    const existingPerm = Array.from(jobPerms).find(p => p.toLowerCase() === permission.toLowerCase());

    if (existingPerm) {
      jobPerms.delete(existingPerm);
    } else {
      jobPerms.add(permission);
    }

    if (jobPerms.size === 0) {
      newPermissions.delete(jobKey);
      newSelectedJobs.delete(jobKey);
    } else {
      newPermissions.set(jobKey, jobPerms);
      newSelectedJobs.add(jobKey);
    }

    setSelectedPermissions(newPermissions);
    setSelectedJobs(newSelectedJobs);
  };

  const handleSelectAllPermissions = (jobKey: string, permissions: string[]) => {
    const newPermissions = new Map(selectedPermissions);
    const newSelectedJobs = new Set(selectedJobs);
    const currentPerms = newPermissions.get(jobKey) || new Set();
    const currentPermsLower = new Set(Array.from(currentPerms).map(p => p.toLowerCase()));

    // Check if all permissions are selected (case-insensitive)
    const allSelected = permissions.every(p => currentPermsLower.has(p.toLowerCase()));

    if (allSelected) {
      newPermissions.delete(jobKey);
      newSelectedJobs.delete(jobKey);
    } else {
      newPermissions.set(jobKey, new Set(permissions));
      newSelectedJobs.add(jobKey);
    }

    setSelectedPermissions(newPermissions);
    setSelectedJobs(newSelectedJobs);
  };

  const handleSubmit = async () => {
    // Clear previous errors
    setFieldErrors({ name: '', shortCode: '', roleAccessFor: '' });
    setError('');

    // Validate fields
    const errors = {
      name: !formData.name.trim() ? 'Role name is required' : '',
      shortCode: !formData.shortCode.trim() ? 'Short code is required' : '',
      roleAccessFor: formData.roleAccessFor.length === 0 ? 'Module is required' : '',
    };

    // Check if there are any errors - set field errors (inline display only)
    const errorMessages = Object.values(errors).filter(Boolean);
    if (errorMessages.length > 0) {
      setFieldErrors(errors);
      // Frontend validation errors are shown inline - no toast message needed
      return;
    }

    // Build jobs array from selected module (API now expects single-module format)
    // Take the first selected module since API only supports one module per role
    const selectedModuleId = formData.roleAccessFor[0];
    const selectedModule = moduleHierarchy.find((m) => m.moduleId === selectedModuleId);

    if (!selectedModule) {
      // Frontend validation - no toast message needed
      return;
    }

    const jobs = selectedModule.jobs
      .filter((job) => {
        const jobKey = `${selectedModuleId}-${job.name}`;
        return selectedJobs.has(jobKey) && selectedPermissions.has(jobKey);
      })
      .map((job) => {
        const jobKey = `${selectedModuleId}-${job.name}`;
        const perms = selectedPermissions.get(jobKey) || new Set();
        const isMenu = jobMenuSettings.get(jobKey) ?? true; // Default to true if not set
        // Get user-specified displayOrder, with fallback based on isMenu
        const displayOrder = jobDisplayOrder.get(jobKey) ?? (isMenu ? 1 : 0);
        return {
          jobName: job.name,
          isMenu,
          displayOrder,
          permissions: Array.from(perms).map(name => ({ name, isSelf: false })), // Send as {name, isSelf} objects
        };
      })
      .filter((job) => job.permissions.length > 0);

    if (jobs.length === 0) {
      toast.current?.show({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Please select at least one job with permissions from the module',
        life: 5000,
      });
      return;
    }

    // Payload uses single-module format: moduleId, moduleName, jobs at root level
    const payload = {
      name: formData.name,
      shortCode: formData.shortCode,
      description: formData.description,
      moduleId: selectedModule.moduleId,
      moduleName: selectedModule.moduleName,
      jobs,
    };

    setLoading(true);
    setError('');

    try {
      if (isEditMode && id) {
        await updateRole(id, payload);
      } else {
        const newRole = await createRole(payload);
        if (dialogMode && onSuccess) { onSuccess({ _id: newRole._id, name: newRole.name }); return; }
      }
      toast.current?.show({ severity: 'success', summary: 'Success', detail: `Role ${isEditMode ? 'updated' : 'created'} successfully`, life: 3000 });
      setTimeout(() => navigateToList(), 1000);
    } catch (err: any) {
      const errorMsg = extractErrorMessage(err, 'Failed to save role');
      setError(errorMsg);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMsg,
        life: 10000,
      });
    } finally {
      setLoading(false);
    }
  };

  const moduleOptions = moduleHierarchy.map((m) => ({ label: m.moduleName, value: m.moduleId }));

  // Debug logging
  useEffect(() => {
    console.log('🔍 Debug - loadingModules:', loadingModules);
    console.log('🔍 Debug - moduleHierarchy:', moduleHierarchy);
    console.log('🔍 Debug - moduleOptions:', moduleOptions);
    console.log('🔍 Debug - formData.roleAccessFor:', formData.roleAccessFor);
    console.log('🔍 Debug - Matching check:', moduleOptions.filter(opt => formData.roleAccessFor.includes(opt.value)));
  }, [loadingModules, moduleHierarchy, moduleOptions, formData.roleAccessFor]);

  const getSelectedPermissionCount = (jobKey: string) => selectedPermissions.get(jobKey)?.size || 0;
  const getSelectedJobCount = (moduleId: string) => Array.from(selectedJobs).filter((jk) => jk.startsWith(`${moduleId}-`)).length;

  if (initialLoading) {
    return (
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900 flex justify-center items-center">
        <ProgressSpinner style={{ width: '50px', height: '50px' }} />
      </div>
    );
  }

  // Check permissions - only allow if user can create (new) or update (edit)
  const hasRequiredPermission = isEditMode ? canUpdate : canCreate;

  if (!hasRequiredPermission) {
    return (
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigateToList()}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
            >
              <i className="pi pi-arrow-left text-lg" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Role' : 'Create Role'}
              </h1>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
            <i className="pi pi-exclamation-circle text-base" />
            <span className="text-sm">
              You don't have permission to {isEditMode ? 'edit' : 'create'} roles. Please contact your administrator.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900" data-testid="SCR-Role-Form">
        {/* Header - Compact */}
        {!dialogMode && (
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleNavigate('/roles')}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
              >
                <i className="pi pi-arrow-left text-lg" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {isEditMode ? 'Edit Role' : 'Create New Role'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isEditMode ? 'Update role configuration and permissions' : 'Configure role access and permissions'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} noValidate>
          {/* Main Form Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Basic Info */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <i className="pi pi-info-circle" />
              Basic Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Role Name <span className="text-red-500">*</span>
                </label>
                <Input
                  name="roleName"
                  value={formData.name}
                  onChange={(value: string) => {
                    handleInputChange('name', value);
                    if (value.trim()) {
                      setFieldErrors((prev) => ({ ...prev, name: '' }));
                    }
                  }}
                  placeholder="Enter role name"
                  error={fieldErrors.name}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Short Code <span className="text-red-500">*</span>
                </label>
                <Input
                  name="shortCode"
                  value={formData.shortCode}
                  onChange={(value: string) => {
                    handleInputChange('shortCode', value);
                    if (value.trim()) {
                      setFieldErrors((prev) => ({ ...prev, shortCode: '' }));
                    }
                  }}
                  placeholder="Enter short code"
                  error={fieldErrors.shortCode}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Module <span className="text-red-500">*</span>
                  {loadingModules && <span className="text-amber-500 ml-2 text-xs">(Loading...)</span>}
                </label>
                <Dropdown
                  value={formData.roleAccessFor[0] || null}
                  options={moduleOptions}
                  onChange={(e: { value: string }) => {
                    const selectedValue = e.value ? [e.value] : [];
                    handleRoleAccessChange(selectedValue);
                    if (e.value) {
                      setFieldErrors((prev) => ({ ...prev, roleAccessFor: '' }));
                    }
                  }}
                  placeholder={loadingModules ? "Loading modules..." : "Select module"}
                  disabled={loadingModules}
                  filter
                  showClear
                  style={{ width: '100%' }}
                />
                {fieldErrors.roleAccessFor && (
                  <small className="text-red-500 text-xs">{fieldErrors.roleAccessFor}</small>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <TextArea
                  name="description"
                  value={formData.description}
                  onChange={(value: string) => handleInputChange('description', value)}
                  placeholder="Optional description"
                  rows={1}
                />
              </div>
            </div>
          </div>

          {/* Permissions Tree */}
          {formData.roleAccessFor.length > 0 && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <i className="pi pi-shield" />
                Modules & Permissions
                <span className="ml-auto text-xs normal-case font-normal">Click on a module to expand jobs</span>
              </div>

              {selectedModulesWithJobs.length === 0 ? (
                <div className="flex flex-col justify-center items-center py-12 px-6 gap-2">
                  <ProgressSpinner style={{ width: '30px', height: '30px' }} />
                  <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
                </div>
              ) : (
                <div className={styles.moduleTreeContent}>
                {selectedModulesWithJobs.map((module) => {
                  const isModuleExpanded = expandedModules.has(module.moduleId);
                  const selectedJobsCount = getSelectedJobCount(module.moduleId);
                  const totalJobsCount = module.jobs.length;

                  return (
                    <div key={module.moduleId} className={styles.moduleCard}>
                      {/* Module Header */}
                      <div
                        className={styles.moduleHeader}
                        onClick={() => toggleModuleExpand(module.moduleId)}
                      >
                        <i className={styles.moduleIcon + " pi pi-folder"} />
                        <span className={styles.moduleName}>{module.moduleName}</span>
                        <Tag
                          value={`${totalJobsCount} jobs`}
                          severity="success"
                        />
                        <div className={styles.moduleActions}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openJobDialog(module.moduleId); }}
                            className={styles.moduleAction + " " + styles.addAction}
                            data-pr-tooltip="Add Job"
                          >
                            <i className="pi pi-plus" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const updatedModules = formData.roleAccessFor.filter(id => id !== module.moduleId);
                              handleRoleAccessChange(updatedModules);
                            }}
                            className={styles.moduleAction + " " + styles.removeAction}
                            data-pr-tooltip="Remove Module"
                          >
                            <i className="pi pi-times" />
                          </button>
                        </div>
                        <i className={styles.expandIcon + ` pi ${isModuleExpanded ? 'pi-chevron-down' : 'pi-chevron-right'}`} />
                      </div>
                      <Tooltip target="[data-pr-tooltip]" />

                      {/* Jobs Tree Structure */}
                      {isModuleExpanded && (
                        <div className={styles.jobList}>
                          {module.jobs.map((job) => {
                            const jobKey = `${module.moduleId}-${job.name}`;
                            const isJobExpanded = expandedJobs.has(jobKey);
                            const isJobSelected = selectedJobs.has(jobKey);
                            const selectedPermsCount = getSelectedPermissionCount(jobKey);
                            const jobPermissions = selectedPermissions.get(jobKey) || new Set();
                            // Sort permissions in consistent CRUD order
                            const sortedPermissions = sortPermissions(job.permissions);
                            // Create a lowercase set for case-insensitive matching
                            const jobPermissionsLower = new Set(Array.from(jobPermissions).map(p => p.toLowerCase()));

                            return (
                              <div key={jobKey} className={styles.jobItem}>
                                {/* Job content card */}
                                <div className={styles.jobContent}>
                                  <div
                                    className={styles.jobCard}
                                    onClick={() => toggleJobExpand(jobKey)}
                                  >
                                    {/* Left side: Checkbox, Icon, Name */}
                                    <div className={styles.jobCheckbox} onClick={(e) => e.stopPropagation()}>
                                      <Checkbox checked={isJobSelected} onChange={() => handleJobSelect(jobKey, sortedPermissions)} />
                                    </div>
                                    <i className={styles.jobIcon + " pi pi-briefcase"} />
                                    <span className={styles.jobName}>{job.name}</span>

                                    {/* Right side: Settings and Actions grouped together */}
                                    <div className={styles.jobSettings}>
                                      {/* isMenu Toggle and displayOrder - Only show if job is selected and menuEligible */}
                                      {isJobSelected && job.menuEligible && (
                                        <>
                                          <div
                                            className={styles.jobSetting}
                                            onClick={(e) => e.stopPropagation()}
                                            data-pr-tooltip="Toggle menu visibility"
                                          >
                                            <Checkbox
                                              checked={jobMenuSettings.get(jobKey) ?? true}
                                              onChange={() => handleJobMenuToggle(jobKey)}
                                            />
                                            <span className={styles.jobSettingLabel}>Menu</span>
                                          </div>
                                          <div
                                            className={styles.jobSetting}
                                            onClick={(e) => e.stopPropagation()}
                                            data-pr-tooltip="Display order (≥1 visible, ≤0 hidden)"
                                          >
                                            <span className={styles.jobSettingLabel}>Order</span>
                                            <input
                                              type="number"
                                              value={jobDisplayOrder.get(jobKey) ?? ((jobMenuSettings.get(jobKey) ?? true) ? 1 : 0)}
                                              onChange={(e) => {
                                                const val = parseInt(e.target.value, 10);
                                                handleDisplayOrderChange(jobKey, isNaN(val) ? 0 : val);
                                              }}
                                              className={styles.jobOrderInput}
                                            />
                                          </div>
                                        </>
                                      )}

                                        {/* Permission count tag */}
                                        <Tag
                                          value={`${selectedPermsCount}/${sortedPermissions.length}`}
                                          severity={selectedPermsCount > 0 ? 'success' : 'secondary'}
                                        />

                                        {/* Add permission button */}
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); openPermissionDialog(module.moduleId, job.jobId); }}
                                          className={styles.moduleAction + " " + styles.addAction}
                                          data-pr-tooltip="Add permission"
                                        >
                                          <i className="pi pi-plus" />
                                        </button>

                                        {/* Expand/collapse icon */}
                                        <i className={styles.expandIcon + ` pi ${isJobExpanded ? 'pi-chevron-down' : 'pi-chevron-right'}`} />
                                      </div>
                                    </div>

                                  {/* Permissions - Nested inside job */}
                                  {isJobExpanded && (
                                    <div className={styles.permissionsList}>
                                      <div className={styles.permissionsHeader}>
                                        <button
                                          type="button"
                                          className={styles.selectAllButton}
                                          onClick={() => handleSelectAllPermissions(jobKey, sortedPermissions)}
                                        >
                                          {selectedPermsCount === sortedPermissions.length ? 'Deselect All' : 'Select All'}
                                        </button>
                                      </div>
                                      <div className={styles.permissionsGrid}>
                                        {sortedPermissions.map((permission) => (
                                          <div key={permission} className={styles.permissionItem}>
                                            <Checkbox
                                              checked={jobPermissionsLower.has(permission.toLowerCase())}
                                              onChange={() => handlePermissionToggle(jobKey, permission)}
                                              label={permission}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          )}

          {/* Section: Form Actions */}
          <div className="p-4">
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                label="Cancel"
                severity="secondary"
                outlined
                onClick={() => {
                  if (dialogMode && onCancel) {
                    onCancel();
                  } else {
                    handleNavigate('/roles');
                  }
                }}
                disabled={loading}
              />
              <Button
                type="button"
                label={loading ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
                icon={loading ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
                onClick={handleSubmit}
                disabled={loading}
              />
            </div>
          </div>
        </div>
        </form>
      </div>

      {/* Leave confirmation dialog */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="RoleForm.Dialog.Leave"
      />

      {/* Dialogs */}
      <JobCreateDialog
        open={jobDialogOpen}
        onClose={() => { setJobDialogOpen(false); setActiveModuleId(null); }}
        onSuccess={handleJobCreated}
        moduleId={activeModuleId || undefined}
      />
      <PermissionCreateDialog
        open={permissionDialogOpen}
        onClose={() => { setPermissionDialogOpen(false); setActiveModuleId(null); setActiveJobId(null); }}
        onSuccess={handlePermissionCreated}
        moduleId={activeModuleId || undefined}
        jobId={activeJobId || undefined}
      />
    </>
  );
};

export default RoleForm;
