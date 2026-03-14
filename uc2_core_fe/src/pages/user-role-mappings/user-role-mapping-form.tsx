/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Tag } from 'primereact/tag';
import { Skeleton } from 'primereact/skeleton';
import { Tooltip } from 'primereact/tooltip';
import { Toast } from 'mainFe/Toast';
import { Checkbox } from 'mainFe/Checkbox';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';

import FormInput from '../../components/forms/form-input';
import FormSelect from '../../components/forms/form-select';
import FormMultiSelect from '../../components/forms/form-multi-select';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { useFormDirtyTracker } from '../../hooks/useFormDirtyTracker';
import {
  fetchModuleHierarchy,
  getJobsForSelectedModules,
  fetchRolesForDropdown,
  getRoleById,
  type ModuleHierarchy,
  type Role,
} from '../../services/roles.service';
import {
  getUserRoleMappingById,
  createUserRoleMapping,
  updateUserRoleMapping,
  type UserRoleMappingCreateRequest,
  type ModulePermission,
} from '../../services/user-role-mapping.service';
import { extractErrorMessage } from '../../utils/error-handler';
import { personnelService } from '../../services/personnel.service';
import { unitsService } from '../../services/units.service';
import type { Personnel } from '../../types';

interface FormData {
  userId: string;
  roleId: string;
  unitId: string;
  additionalModules: string[]; // moduleIds for additional permissions
}

const UserRoleMappingForm = () => {
  const navigate = useAppNavigate();
  const location = useLocation();
  const toast = useRef<Toast>(null);

  // Determine base path based on current URL
  const basePath = location.pathname.includes('user-role-permissions')
    ? '/user-role-permissions'
    : '/user-role-mappings';
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'user-role-mappings',
    basePath: basePath,
  });
  const isEditMode = Boolean(id);

  // Form data
  const [formData, setFormData] = useState<FormData>({
    userId: '',
    roleId: '',
    unitId: '',
    additionalModules: [],
  });

  // Personnel
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [personnelLoading, setPersonnelLoading] = useState(true);
  const [selectedPersonnel, setSelectedPersonnel] = useState<Personnel | null>(null);

  // Units for selected personnel
  const [personnelUnits, setPersonnelUnits] = useState<{ _id: string; name: string }[]>([]);

  // Roles
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  // Module hierarchy for additional permissions
  const [moduleHierarchy, setModuleHierarchy] = useState<ModuleHierarchy[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);

  // Additional permissions state (like role form)
  const [additionalJobs, setAdditionalJobs] = useState<Set<string>>(new Set());
  const [additionalPermissions, setAdditionalPermissions] = useState<Map<string, Set<string>>>(new Map());

  // Exclusion permissions state (from selected role)
  const [exclusionJobs, setExclusionJobs] = useState<Set<string>>(new Set());
  const [exclusionPermissions, setExclusionPermissions] = useState<Map<string, Set<string>>>(new Map());

  // isMenu and displayOrder state for additional permissions (like role form)
  const [additionalJobMenuSettings, setAdditionalJobMenuSettings] = useState<Map<string, boolean>>(new Map());
  const [additionalJobDisplayOrder, setAdditionalJobDisplayOrder] = useState<Map<string, number>>(new Map());

  // isMenu and displayOrder state for exclusion permissions
  const [exclusionJobMenuSettings, setExclusionJobMenuSettings] = useState<Map<string, boolean>>(new Map());
  const [exclusionJobDisplayOrder, setExclusionJobDisplayOrder] = useState<Map<string, number>>(new Map());

  // Collapsible state for tree UI
  const [expandedAdditionalModules, setExpandedAdditionalModules] = useState<Set<string>>(new Set());
  const [expandedAdditionalJobs, setExpandedAdditionalJobs] = useState<Set<string>>(new Set());
  const [expandedExclusionModules, setExpandedExclusionModules] = useState<Set<string>>(new Set());
  const [expandedExclusionJobs, setExpandedExclusionJobs] = useState<Set<string>>(new Set());

  // Loading states
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [error, setError] = useState('');

  // Field-level validation errors
  const [fieldErrors, setFieldErrors] = useState({
    userId: '',
    roleId: '',
    unitId: '',
  });

  // Track dirty state for navigation blocking
  const { isDirty, setInitialValues, checkDirty } = useFormDirtyTracker();

  // Navigation blocker
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Set breadcrumb title to show user name instead of UUID in edit mode
  const userBreadcrumbTitle = isEditMode && selectedPersonnel
    ? selectedPersonnel.name || `${selectedPersonnel.firstName || ''} ${selectedPersonnel.lastName || ''}`.trim()
    : null;
  useBreadcrumbTitle(userBreadcrumbTitle);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load personnel list
        setPersonnelLoading(true);
        const personnelData = await personnelService.getAllForDropdown();
        setPersonnelList(personnelData.filter((p) => !p.isDeleted));
        setPersonnelLoading(false);

        // Load roles
        setRolesLoading(true);
        const rolesData = await fetchRolesForDropdown();
        setRoles(rolesData.filter((r) => !r.isDelete));
        setRolesLoading(false);

        // Load module hierarchy
        setLoadingModules(true);
        const hierarchyData = await fetchModuleHierarchy();
        setModuleHierarchy(hierarchyData || []);
        setLoadingModules(false);
      } catch (err) {
        console.error('Failed to load initial data:', err);
        setError('Failed to load data');
        setPersonnelLoading(false);
        setRolesLoading(false);
        setLoadingModules(false);
      }
    };

    loadInitialData();
  }, []);

  // Load existing mapping in edit mode - wait for ID decryption
  useEffect(() => {
    if (isEditMode && isReady && id && !personnelLoading && !rolesLoading && !loadingModules) {
      const loadMapping = async () => {
        try {
          const mapping = await getUserRoleMappingById(id);

          // Set form data
          setFormData({
            userId: mapping.userId,
            roleId: mapping.roleId,
            unitId: mapping.unitId,
            additionalModules: mapping.additionalPermissions?.map((p) => p.moduleId) || [],
          });

          // Find and set selected personnel
          const personnel = personnelList.find((p) => p._id === mapping.userId);
          if (personnel) {
            setSelectedPersonnel(personnel);
            // Set personnel units - check units array first (new structure), then fall back to single unit
            if (personnel.units && personnel.units.length > 0) {
              // Extract unit info from nested structure (units[].unit)
              setPersonnelUnits(personnel.units.map((u) => ({ _id: u.unit._id, name: u.unit.name })));
            } else if (personnel.unit) {
              setPersonnelUnits([personnel.unit]);
            }
          }

          // Load selected role
          if (mapping.roleId) {
            const role = await getRoleById(mapping.roleId);
            setSelectedRole(role);
          }

          // Set additional permissions
          const newAdditionalJobs = new Set<string>();
          const newAdditionalPermissions = new Map<string, Set<string>>();
          const newAdditionalMenuSettings = new Map<string, boolean>();
          const newAdditionalDisplayOrder = new Map<string, number>();

          mapping.additionalPermissions?.forEach((module) => {
            module.jobs.forEach((job) => {
              const jobKey = `additional-${module.moduleId}-${job.jobName}`;
              newAdditionalJobs.add(jobKey);
              const permSet = new Set<string>();
              job.permissions.forEach((perm) => permSet.add(perm.name));
              newAdditionalPermissions.set(jobKey, permSet);
              // Load isMenu and displayOrder settings
              const isMenu = job.isMenu !== undefined ? job.isMenu : true;
              newAdditionalMenuSettings.set(jobKey, isMenu);
              newAdditionalDisplayOrder.set(jobKey, job.displayOrder ?? (isMenu ? 1 : 0));
            });
          });

          setAdditionalJobs(newAdditionalJobs);
          setAdditionalPermissions(newAdditionalPermissions);
          setAdditionalJobMenuSettings(newAdditionalMenuSettings);
          setAdditionalJobDisplayOrder(newAdditionalDisplayOrder);

          // Set exclusion permissions
          const newExclusionJobs = new Set<string>();
          const newExclusionPermissions = new Map<string, Set<string>>();
          const newExclusionMenuSettings = new Map<string, boolean>();
          const newExclusionDisplayOrder = new Map<string, number>();

          mapping.exclusionPermissions?.forEach((module) => {
            module.jobs.forEach((job) => {
              const jobKey = `exclusion-${module.moduleId}-${job.jobName}`;
              newExclusionJobs.add(jobKey);
              const permSet = new Set<string>();
              job.permissions.forEach((perm) => permSet.add(perm.name));
              newExclusionPermissions.set(jobKey, permSet);
              // Load isMenu and displayOrder settings
              const isMenu = job.isMenu !== undefined ? job.isMenu : true;
              newExclusionMenuSettings.set(jobKey, isMenu);
              newExclusionDisplayOrder.set(jobKey, job.displayOrder ?? (isMenu ? 1 : 0));
            });
          });

          setExclusionJobs(newExclusionJobs);
          setExclusionPermissions(newExclusionPermissions);
          setExclusionJobMenuSettings(newExclusionMenuSettings);
          setExclusionJobDisplayOrder(newExclusionDisplayOrder);

          // Store initial values for dirty checking
          setInitialValues({
            formData: {
              userId: mapping.userId,
              roleId: mapping.roleId,
              unitId: mapping.unitId,
              additionalModules: mapping.additionalPermissions?.map((p) => p.moduleId) || [],
            },
            additionalJobs: newAdditionalJobs,
            additionalPermissions: newAdditionalPermissions,
            exclusionJobs: newExclusionJobs,
            exclusionPermissions: newExclusionPermissions,
          });
        } catch (err: any) {
          console.error('Failed to load mapping:', err);
          setError(extractErrorMessage(err, 'Failed to load mapping'));
        } finally {
          setInitialLoading(false);
        }
      };

      loadMapping();
    } else if (!isEditMode) {
      // For create mode, store initial empty state
      setInitialValues({
        formData: { userId: '', roleId: '', unitId: '', additionalModules: [] },
        additionalJobs: new Set(),
        additionalPermissions: new Map(),
        exclusionJobs: new Set(),
        exclusionPermissions: new Map(),
      });
      setInitialLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isReady, isEditMode, personnelLoading, rolesLoading, loadingModules, setInitialValues]);

  // Track dirty state by comparing current values with initial values
  useEffect(() => {
    checkDirty({
      formData,
      additionalJobs,
      additionalPermissions,
      exclusionJobs,
      exclusionPermissions,
    });
  }, [formData, additionalJobs, additionalPermissions, exclusionJobs, exclusionPermissions, checkDirty]);

  // Handle personnel selection
  const handlePersonnelChange = async (newValue: Personnel | null) => {
    if (newValue) {
      // Update userId in formData
      setFormData((prev) => ({ ...prev, userId: newValue._id }));

      // Check for units array first (new structure), then fall back to single unit (legacy)
      if (newValue.units && newValue.units.length > 0) {
        // Use units array - extract unit info from nested structure (units[].unit)
        const mappedUnits = newValue.units.map((u) => ({
          _id: u.unit._id,
          name: u.unit.name,
        }));
        setPersonnelUnits(mappedUnits);
        // Auto-select first unit if only one, otherwise let user choose
        if (mappedUnits.length === 1) {
          setFormData((prev) => ({ ...prev, unitId: mappedUnits[0]._id }));
        } else {
          setFormData((prev) => ({ ...prev, unitId: '' }));
        }
      } else if (newValue.unit) {
        // Legacy: single unit object
        setPersonnelUnits([newValue.unit]);
        setFormData((prev) => ({ ...prev, unitId: newValue.unit!._id }));
      } else if (newValue.unitId) {
        // If only unitId exists, fetch the unit
        try {
          const unit = await unitsService.getById(newValue.unitId);
          setPersonnelUnits([{ _id: unit._id, name: unit.name }]);
          setFormData((prev) => ({ ...prev, unitId: unit._id }));
        } catch (err) {
          console.error('Failed to fetch unit:', err);
          setPersonnelUnits([]);
          setFormData((prev) => ({ ...prev, unitId: '' }));
        }
      } else {
        setPersonnelUnits([]);
        setFormData((prev) => ({ ...prev, unitId: '' }));
      }
    } else {
      setFormData((prev) => ({ ...prev, userId: '', unitId: '' }));
      setPersonnelUnits([]);
    }
  };

  // Handle role selection
  const handleRoleChange = async (e: { value: string }) => {
    const roleId = e.value;
    setFormData((prev) => ({ ...prev, roleId }));

    // Clear exclusion permissions when role changes
    setExclusionJobs(new Set());
    setExclusionPermissions(new Map());

    if (roleId) {
      try {
        const role = await getRoleById(roleId);
        setSelectedRole(role);
      } catch (err) {
        console.error('Failed to load role:', err);
        setSelectedRole(null);
      }
    } else {
      setSelectedRole(null);
    }
  };

  // Handle additional modules selection
  const handleAdditionalModulesChange = (selectedValues: string[]) => {
    const removedModules = formData.additionalModules.filter((m) => !selectedValues.includes(m));

    if (removedModules.length > 0) {
      const newJobs = new Set(additionalJobs);
      const newPerms = new Map(additionalPermissions);

      removedModules.forEach((moduleId) => {
        Array.from(newJobs).forEach((jobKey) => {
          if (jobKey.includes(`-${moduleId}-`)) {
            newJobs.delete(jobKey);
            newPerms.delete(jobKey);
          }
        });
      });

      setAdditionalJobs(newJobs);
      setAdditionalPermissions(newPerms);
    }

    setFormData((prev) => ({ ...prev, additionalModules: selectedValues }));
  };

  // Additional permissions handlers
  const handleAdditionalJobToggle = (jobKey: string, jobPermissions?: string[]) => {
    const newJobs = new Set(additionalJobs);
    const newPerms = new Map(additionalPermissions);
    const newMenuSettings = new Map(additionalJobMenuSettings);
    const newDisplayOrder = new Map(additionalJobDisplayOrder);

    if (newJobs.has(jobKey)) {
      // Unchecking job - remove job and its permissions
      newJobs.delete(jobKey);
      newPerms.delete(jobKey);
      newMenuSettings.delete(jobKey);
      newDisplayOrder.delete(jobKey);
    } else {
      // Checking job - add job and select all its permissions
      newJobs.add(jobKey);
      if (jobPermissions && jobPermissions.length > 0) {
        newPerms.set(jobKey, new Set(jobPermissions));
      }
      // Set default isMenu to true and displayOrder to 1
      newMenuSettings.set(jobKey, true);
      newDisplayOrder.set(jobKey, 1);
    }

    setAdditionalJobs(newJobs);
    setAdditionalPermissions(newPerms);
    setAdditionalJobMenuSettings(newMenuSettings);
    setAdditionalJobDisplayOrder(newDisplayOrder);
  };

  // Handle isMenu toggle for additional permissions
  const handleAdditionalJobMenuToggle = (jobKey: string) => {
    const newMenuSettings = new Map(additionalJobMenuSettings);
    const newDisplayOrder = new Map(additionalJobDisplayOrder);
    const currentIsMenu = newMenuSettings.get(jobKey) ?? true;
    const newIsMenu = !currentIsMenu;

    newMenuSettings.set(jobKey, newIsMenu);
    // Auto-adjust displayOrder based on isMenu
    newDisplayOrder.set(jobKey, newIsMenu ? 1 : 0);

    setAdditionalJobMenuSettings(newMenuSettings);
    setAdditionalJobDisplayOrder(newDisplayOrder);
  };

  // Handle displayOrder change for additional permissions
  const handleAdditionalDisplayOrderChange = (jobKey: string, value: number) => {
    const newDisplayOrder = new Map(additionalJobDisplayOrder);
    const newMenuSettings = new Map(additionalJobMenuSettings);

    newDisplayOrder.set(jobKey, value);
    // Auto-update isMenu based on displayOrder
    newMenuSettings.set(jobKey, value > 0);

    setAdditionalJobDisplayOrder(newDisplayOrder);
    setAdditionalJobMenuSettings(newMenuSettings);
  };

  const handleAdditionalPermissionToggle = (jobKey: string, permission: string) => {
    const newPerms = new Map(additionalPermissions);
    const newJobs = new Set(additionalJobs);
    const jobPerms = new Set(newPerms.get(jobKey) || []);

    if (jobPerms.has(permission)) {
      jobPerms.delete(permission);
    } else {
      jobPerms.add(permission);
    }

    if (jobPerms.size === 0) {
      newPerms.delete(jobKey);
      newJobs.delete(jobKey);
    } else {
      newPerms.set(jobKey, jobPerms);
      newJobs.add(jobKey);
    }

    setAdditionalJobs(newJobs);
    setAdditionalPermissions(newPerms);
  };

  const handleSelectAllAdditionalPermissions = (jobKey: string, permissions: string[]) => {
    const newPerms = new Map(additionalPermissions);
    const newJobs = new Set(additionalJobs);
    const currentPerms = newPerms.get(jobKey) || new Set();
    // Toggle: if all selected, deselect all; otherwise select all
    if (currentPerms.size === permissions.length) {
      newPerms.delete(jobKey);
      newJobs.delete(jobKey);
    } else {
      newPerms.set(jobKey, new Set(permissions));
      newJobs.add(jobKey);
    }
    setAdditionalJobs(newJobs);
    setAdditionalPermissions(newPerms);
  };

  // Toggle functions for tree UI
  const toggleAdditionalModuleExpand = (moduleId: string) => {
    setExpandedAdditionalModules((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(moduleId)) newSet.delete(moduleId);
      else newSet.add(moduleId);
      return newSet;
    });
  };

  const toggleAdditionalJobExpand = (jobKey: string) => {
    setExpandedAdditionalJobs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(jobKey)) newSet.delete(jobKey);
      else newSet.add(jobKey);
      return newSet;
    });
  };

  const toggleExclusionModuleExpand = (moduleId: string) => {
    setExpandedExclusionModules((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(moduleId)) newSet.delete(moduleId);
      else newSet.add(moduleId);
      return newSet;
    });
  };

  const toggleExclusionJobExpand = (jobKey: string) => {
    setExpandedExclusionJobs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(jobKey)) newSet.delete(jobKey);
      else newSet.add(jobKey);
      return newSet;
    });
  };

  // Helper functions for counts
  const getAdditionalSelectedPermissionCount = (jobKey: string) => additionalPermissions.get(jobKey)?.size || 0;
  const getExclusionSelectedPermissionCount = (jobKey: string) => exclusionPermissions.get(jobKey)?.size || 0;

  // Exclusion permissions handlers
  const handleExclusionPermissionToggle = (jobKey: string, permission: string) => {
    const newPerms = new Map(exclusionPermissions);
    const newMenuSettings = new Map(exclusionJobMenuSettings);
    const newDisplayOrder = new Map(exclusionJobDisplayOrder);
    const jobPerms = newPerms.get(jobKey) || new Set();

    if (jobPerms.has(permission)) {
      jobPerms.delete(permission);
    } else {
      jobPerms.add(permission);
    }

    // Update jobs set based on permissions
    const newJobs = new Set(exclusionJobs);
    if (jobPerms.size === 0) {
      newPerms.delete(jobKey);
      newJobs.delete(jobKey);
      newMenuSettings.delete(jobKey);
      newDisplayOrder.delete(jobKey);
    } else {
      newPerms.set(jobKey, jobPerms);
      newJobs.add(jobKey);
      // Set default isMenu and displayOrder if not already set
      if (!newMenuSettings.has(jobKey)) {
        newMenuSettings.set(jobKey, true);
        newDisplayOrder.set(jobKey, 1);
      }
    }

    setExclusionJobs(newJobs);
    setExclusionPermissions(newPerms);
    setExclusionJobMenuSettings(newMenuSettings);
    setExclusionJobDisplayOrder(newDisplayOrder);
  };

  // Handle isMenu toggle for exclusion permissions
  const handleExclusionJobMenuToggle = (jobKey: string) => {
    const newMenuSettings = new Map(exclusionJobMenuSettings);
    const newDisplayOrder = new Map(exclusionJobDisplayOrder);
    const currentIsMenu = newMenuSettings.get(jobKey) ?? true;
    const newIsMenu = !currentIsMenu;

    newMenuSettings.set(jobKey, newIsMenu);
    // Auto-adjust displayOrder based on isMenu
    newDisplayOrder.set(jobKey, newIsMenu ? 1 : 0);

    setExclusionJobMenuSettings(newMenuSettings);
    setExclusionJobDisplayOrder(newDisplayOrder);
  };

  // Handle displayOrder change for exclusion permissions
  const handleExclusionDisplayOrderChange = (jobKey: string, value: number) => {
    const newDisplayOrder = new Map(exclusionJobDisplayOrder);
    const newMenuSettings = new Map(exclusionJobMenuSettings);

    newDisplayOrder.set(jobKey, value);
    // Auto-update isMenu based on displayOrder
    newMenuSettings.set(jobKey, value > 0);

    setExclusionJobDisplayOrder(newDisplayOrder);
    setExclusionJobMenuSettings(newMenuSettings);
  };

  // Get selected modules with jobs for additional permissions
  const selectedAdditionalModulesWithJobs = useMemo(
    () => getJobsForSelectedModules(moduleHierarchy, formData.additionalModules),
    [moduleHierarchy, formData.additionalModules]
  );

  // Module options for dropdown
  const moduleOptions = (moduleHierarchy || []).map((m) => ({
    moduleId: m.moduleId,
    moduleName: m.moduleName,
  }));

  // Role options for dropdown
  const roleOptions = (roles || []).map((r) => ({
    value: r._id,
    label: r.name,
  }));

  // Build permissions payload
  const buildPermissionsPayload = (
    jobs: Set<string>,
    permissions: Map<string, Set<string>>,
    prefix: string,
    menuSettings: Map<string, boolean>,
    displayOrderSettings: Map<string, number>
  ): ModulePermission[] => {
    const moduleMap = new Map<string, { moduleId: string; moduleName: string; jobs: Map<string, { jobName: string; isMenu: boolean; displayOrder: number; permissions: Set<string> }> }>();

    jobs.forEach((jobKey) => {
      const perms = permissions.get(jobKey);
      if (!perms || perms.size === 0) return;

      // Parse jobKey: prefix-moduleId-jobName
      const parts = jobKey.replace(`${prefix}-`, '').split('-');
      const moduleId = parts[0];
      const jobName = parts.slice(1).join('-');

      const module = moduleHierarchy.find((m) => m.moduleId === moduleId);
      if (!module) return;

      if (!moduleMap.has(moduleId)) {
        moduleMap.set(moduleId, {
          moduleId,
          moduleName: module.moduleName,
          jobs: new Map(),
        });
      }

      const isMenu = menuSettings.get(jobKey) ?? true;
      const displayOrder = displayOrderSettings.get(jobKey) ?? (isMenu ? 1 : 0);

      moduleMap.get(moduleId)!.jobs.set(jobName, {
        jobName,
        isMenu,
        displayOrder,
        permissions: perms,
      });
    });

    return Array.from(moduleMap.values()).map((module) => ({
      moduleId: module.moduleId,
      moduleName: module.moduleName,
      jobs: Array.from(module.jobs.values()).map((job) => ({
        jobName: job.jobName,
        isMenu: job.isMenu,
        displayOrder: job.displayOrder,
        permissions: Array.from(job.permissions).map((p) => ({ name: p, isSelf: false })),
      })),
    }));
  };

  const handleSubmit = async () => {
    // Clear previous errors
    setFieldErrors({ userId: '', roleId: '', unitId: '' });
    setError('');

    // Validate fields
    const errors = {
      userId: !formData.userId ? 'Personnel is required' : '',
      roleId: !formData.roleId ? 'Role is required' : '',
      unitId: !formData.unitId ? 'Unit is required' : '',
    };

    // Check if there are any errors - show toast and set field errors
    const errorMessages = Object.values(errors).filter(Boolean);
    if (errorMessages.length > 0) {
      setFieldErrors(errors);
      toast.current?.show({
        severity: 'error',
        summary: 'Validation Error',
        detail: errorMessages.join(', '),
        life: 5000,
      });
      return;
    }

    const payload: UserRoleMappingCreateRequest = {
      userId: formData.userId,
      roleId: formData.roleId,
      unitId: formData.unitId,
      additionalPermissions: buildPermissionsPayload(additionalJobs, additionalPermissions, 'additional', additionalJobMenuSettings, additionalJobDisplayOrder),
      exclusionPermissions: buildPermissionsPayload(exclusionJobs, exclusionPermissions, 'exclusion', exclusionJobMenuSettings, exclusionJobDisplayOrder),
    };

    setLoading(true);
    try {
      if (isEditMode && id) {
        await updateUserRoleMapping(id, payload);
      } else {
        await createUserRoleMapping(payload);
      }
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `User role mapping ${isEditMode ? 'updated' : 'created'} successfully`,
        life: 3000,
      });
      setTimeout(() => navigateToList(), 1000);
    } catch (err: any) {
      const errorMsg = extractErrorMessage(err, 'Failed to save user role mapping');
      setError(errorMsg);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMsg,
        life: 10000,
      });
      setLoading(false);
    }
  };

  // Loading skeleton
  if (initialLoading) {
    return (
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="mb-3">
          <Skeleton width="180px" height="36px" className="mb-2" />
          <Skeleton width="250px" height="40px" />
          <Skeleton width="350px" height="24px" />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Skeleton height="56px" />
            <Skeleton height="56px" />
            <Skeleton height="56px" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-3">
          <Skeleton width="200px" height="32px" className="mb-3" />
          <Skeleton height="60px" className="mb-2" />
          <Skeleton height="60px" />
        </div>
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900" data-testid="SCR-UserRoleMapping-Form">
        <div className="mb-3">
          <button
            type="button"
            onClick={() => handleNavigate(basePath)}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
            data-testid="UserRoleMappingForm.Button.Back"
          >
            <i className="pi pi-arrow-left" style={{ fontSize: '1.125rem' }} />
            <span>Back to User Role Mappings</span>
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {isEditMode ? 'Edit User Role Mapping' : 'Assign Role to User'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isEditMode ? 'Update role assignment and permissions' : 'Assign a role to a user with custom permissions'}
          </p>
        </div>


        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* Personnel Selection */}
            <FormSelect
              name="userId"
              label="Personnel"
              value={formData.userId}
              onChange={(e) => {
                const personnel = personnelList.find((p) => p._id === e.target.value);
                handlePersonnelChange(personnel || null);
                // Clear error when user selects a value
                if (e.target.value) {
                  setFieldErrors((prev) => ({ ...prev, userId: '' }));
                }
              }}
              options={personnelList.map((p) => ({
                value: p._id,
                label: `${p.name || `${p.firstName} ${p.lastName}`} (${p.userId})`,
              }))}
              disabled={isEditMode || personnelLoading}
              required
              filter
              filterPlaceholder="Search personnel..."
              error={!!fieldErrors.userId}
              helperText={fieldErrors.userId}
              loading={personnelLoading}
            />

            {/* Unit - Show dropdown only if multiple units, otherwise show disabled input */}
            {personnelUnits.length > 1 ? (
              <FormSelect
                name="unitId"
                label="Unit"
                value={formData.unitId}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, unitId: e.target.value }));
                  // Clear error when user selects a value
                  if (e.target.value) {
                    setFieldErrors((prev) => ({ ...prev, unitId: '' }));
                  }
                }}
                options={personnelUnits.map((u) => ({ value: u._id, label: u.name }))}
                required
                placeholder="Select Unit"
                error={!!fieldErrors.unitId}
                helperText={fieldErrors.unitId}
              />
            ) : (
              <FormInput
                name="unitId"
                label="Unit"
                value={personnelUnits[0]?.name || 'No unit assigned'}
                onChange={() => {}}
                disabled
              />
            )}

            {/* Role */}
            <FormSelect
              name="roleId"
              label="Role"
              value={formData.roleId}
              onChange={(e) => {
                handleRoleChange({ value: e.target.value });
                // Clear error when user selects a value
                if (e.target.value) {
                  setFieldErrors((prev) => ({ ...prev, roleId: '' }));
                }
              }}
              options={roleOptions}
              disabled={rolesLoading}
              required
              error={!!fieldErrors.roleId}
              helperText={fieldErrors.roleId}
              loading={rolesLoading}
            />
          </div>
        </div>

        {/* Additional Permissions Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
            Additional Permissions
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Grant extra permissions beyond the selected role
          </p>

          {/* Module Selection */}
          <div className="mb-3">
            <FormMultiSelect
              name="additionalModules"
              label="Additional Modules"
              value={formData.additionalModules}
              onChange={(value) => handleAdditionalModulesChange(value)}
              options={moduleOptions.map((m) => ({ value: m.moduleId, label: m.moduleName }))}
              disabled={loadingModules}
              display="chip"
              placeholder="Select Modules for Additional Permissions"
              loading={loadingModules}
            />
          </div>

          {/* Jobs and Permissions - Tree UI */}
          {formData.additionalModules.length > 0 && selectedAdditionalModulesWithJobs.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Modules & Permissions</span>
                <span className="text-xs text-gray-500">Click on a module to expand jobs</span>
              </div>
              <Tooltip target="[data-pr-tooltip]" />

              <div className="max-h-[400px] overflow-auto p-3 space-y-4">
                {selectedAdditionalModulesWithJobs.map((module) => {
                  const isModuleExpanded = expandedAdditionalModules.has(module.moduleId);
                  const totalJobsCount = module.jobs.length;

                  return (
                    <div key={module.moduleId} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                      {/* Module Header */}
                      <div
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        onClick={() => toggleAdditionalModuleExpand(module.moduleId)}
                      >
                        <i className="pi pi-folder text-blue-500" style={{ fontSize: '1.25rem' }} />
                        <span className="text-base font-medium text-gray-800 dark:text-white flex-1">{module.moduleName}</span>
                        <Tag
                          value={`${totalJobsCount} jobs`}
                          severity="info"
                          style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '12px' }}
                        />
                        <i className={`pi ${isModuleExpanded ? 'pi-chevron-down' : 'pi-chevron-right'} text-gray-400`} style={{ fontSize: '0.875rem' }} />
                      </div>

                      {/* Jobs Tree Structure */}
                      {isModuleExpanded && (
                        <div className="py-2">
                          {module.jobs.map((job, index) => {
                            const jobKey = `additional-${module.moduleId}-${job.name}`;
                            const isJobExpanded = expandedAdditionalJobs.has(jobKey);
                            const isJobSelected = additionalJobs.has(jobKey);
                            const selectedPermsCount = getAdditionalSelectedPermissionCount(jobKey);
                            const jobPermissions = additionalPermissions.get(jobKey) || new Set();
                            const isLastJob = index === module.jobs.length - 1;

                            return (
                              <div key={jobKey} className="relative">
                                {/* Tree connector lines */}
                                <div className="absolute left-6 top-0 bottom-0 flex flex-col items-center">
                                  <div className={`w-px bg-gray-300 dark:bg-gray-600 ${isLastJob && !isJobExpanded ? 'h-1/2' : 'h-full'}`} />
                                </div>

                                {/* Job Row with tree indent */}
                                <div className="flex items-start">
                                  {/* Tree branch connector */}
                                  <div className="w-8 flex items-center justify-center pt-3">
                                    <div className="w-4 h-px bg-gray-300 dark:bg-gray-600" />
                                  </div>

                                  {/* Job content card */}
                                  <div className="flex-1 mr-4 mb-2">
                                    <div
                                      className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                      onClick={() => toggleAdditionalJobExpand(jobKey)}
                                    >
                                      <div onClick={(e) => e.stopPropagation()}>
                                        <Checkbox checked={isJobSelected} onChange={() => handleAdditionalJobToggle(jobKey, job.permissions)} />
                                      </div>
                                      <i className="pi pi-table text-blue-500" style={{ fontSize: '1rem' }} />
                                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1">{job.name}</span>
                                      {/* isMenu Toggle and displayOrder - only show when job is selected */}
                                      {isJobSelected && (
                                        <div
                                          onClick={(e) => e.stopPropagation()}
                                          className="flex items-center gap-1.5"
                                        >
                                          {/* Show in Menu checkbox */}
                                          <div
                                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700"
                                            data-pr-tooltip="Toggle menu visibility"
                                          >
                                            <Checkbox
                                              checked={additionalJobMenuSettings.get(jobKey) ?? true}
                                              onChange={() => handleAdditionalJobMenuToggle(jobKey)}
                                            />
                                            <span className="text-xs text-gray-600 dark:text-gray-400">
                                              Menu
                                            </span>
                                          </div>
                                          {/* Display Order with up/down arrows */}
                                          <div
                                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700"
                                            data-pr-tooltip="Display order (≥1 visible, ≤0 hidden)"
                                          >
                                            <span className="text-xs text-gray-600 dark:text-gray-400">
                                              Order
                                            </span>
                                            <span className="w-6 text-xs text-center font-medium text-gray-700 dark:text-gray-300">
                                              {additionalJobDisplayOrder.get(jobKey) ?? ((additionalJobMenuSettings.get(jobKey) ?? true) ? 1 : 0)}
                                            </span>
                                            <div className="flex flex-col">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const currentVal = additionalJobDisplayOrder.get(jobKey) ?? 0;
                                                  handleAdditionalDisplayOrderChange(jobKey, currentVal + 1);
                                                }}
                                                className="p-0 h-3 w-4 flex items-center justify-center text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-t"
                                              >
                                                <i className="pi pi-chevron-up" style={{ fontSize: '0.5rem' }} />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const currentVal = additionalJobDisplayOrder.get(jobKey) ?? 0;
                                                  handleAdditionalDisplayOrderChange(jobKey, currentVal - 1);
                                                }}
                                                className="p-0 h-3 w-4 flex items-center justify-center text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-b"
                                              >
                                                <i className="pi pi-chevron-down" style={{ fontSize: '0.5rem' }} />
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      <Tag
                                        value={`${selectedPermsCount}/${job.permissions.length}`}
                                        severity={selectedPermsCount > 0 ? 'success' : 'secondary'}
                                        style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '8px', minWidth: '45px', textAlign: 'center' }}
                                      />
                                      <i className={`pi ${isJobExpanded ? 'pi-chevron-down' : 'pi-chevron-right'} text-gray-400`} style={{ fontSize: '0.8rem' }} />
                                    </div>

                                    {/* Permissions - Nested inside job with tree indent */}
                                    {isJobExpanded && (
                                      <div className="mt-2 ml-6 pl-4 border-l-2 border-gray-200 dark:border-gray-600">
                                        <div className="flex items-center gap-2 mb-2">
                                          <button
                                            type="button"
                                            className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                            onClick={() => handleSelectAllAdditionalPermissions(jobKey, job.permissions)}
                                          >
                                            {selectedPermsCount === job.permissions.length ? 'Deselect All' : 'Select All'}
                                          </button>
                                        </div>
                                        <div className="flex flex-wrap gap-3">
                                          {job.permissions.map((permission) => (
                                            <div key={permission} className="flex items-center bg-white dark:bg-gray-800 px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-600">
                                              <Checkbox
                                                checked={jobPermissions.has(permission)}
                                                onChange={() => handleAdditionalPermissionToggle(jobKey, permission)}
                                                label={permission}
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
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
            </div>
          )}
        </div>

        {/* Exclusion Permissions Section - Only show when role is selected */}
        {selectedRole && selectedRole.permissions && selectedRole.permissions.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
              Exclusion Permissions
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Select permissions to exclude from the role "{selectedRole.name}"
            </p>

            {/* Tree UI for Exclusion Permissions */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Role Permissions</span>
                <span className="text-xs text-gray-500">Click on a module to expand jobs</span>
              </div>

              <div className="max-h-[400px] overflow-auto p-3 space-y-4">
                {selectedRole.permissions.map((module) => {
                  const isModuleExpanded = expandedExclusionModules.has(module.moduleId);
                  const totalJobsCount = module.jobs.length;

                  return (
                    <div key={module.moduleId} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                      {/* Module Header */}
                      <div
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        onClick={() => toggleExclusionModuleExpand(module.moduleId)}
                      >
                        <i className="pi pi-folder text-orange-500" style={{ fontSize: '1.25rem' }} />
                        <span className="text-base font-medium text-gray-800 dark:text-white flex-1">{module.moduleName}</span>
                        <Tag
                          value={`${totalJobsCount} jobs`}
                          severity="warning"
                          style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '12px' }}
                        />
                        <i className={`pi ${isModuleExpanded ? 'pi-chevron-down' : 'pi-chevron-right'} text-gray-400`} style={{ fontSize: '0.875rem' }} />
                      </div>

                      {/* Jobs Tree Structure */}
                      {isModuleExpanded && (
                        <div className="py-2">
                          {module.jobs.map((job, index) => {
                            const jobKey = `exclusion-${module.moduleId}-${job.jobName}`;
                            const isJobExpanded = expandedExclusionJobs.has(jobKey);
                            const excludedCount = getExclusionSelectedPermissionCount(jobKey);
                            const jobPermissions = exclusionPermissions.get(jobKey) || new Set();
                            const isLastJob = index === module.jobs.length - 1;

                            return (
                              <div key={jobKey} className="relative">
                                {/* Tree connector lines */}
                                <div className="absolute left-6 top-0 bottom-0 flex flex-col items-center">
                                  <div className={`w-px bg-gray-300 dark:bg-gray-600 ${isLastJob && !isJobExpanded ? 'h-1/2' : 'h-full'}`} />
                                </div>

                                {/* Job Row with tree indent */}
                                <div className="flex items-start">
                                  {/* Tree branch connector */}
                                  <div className="w-8 flex items-center justify-center pt-3">
                                    <div className="w-4 h-px bg-gray-300 dark:bg-gray-600" />
                                  </div>

                                  {/* Job content card */}
                                  <div className="flex-1 mr-4 mb-2">
                                    <div
                                      className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                      onClick={() => toggleExclusionJobExpand(jobKey)}
                                    >
                                      <i className="pi pi-table text-orange-500" style={{ fontSize: '1rem' }} />
                                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1">{job.jobName}</span>
                                      {/* isMenu Toggle and displayOrder - only show when exclusion has permissions */}
                                      {excludedCount > 0 && (
                                        <div
                                          onClick={(e) => e.stopPropagation()}
                                          className="flex items-center gap-1.5"
                                        >
                                          {/* Show in Menu checkbox */}
                                          <div
                                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700"
                                            data-pr-tooltip="Toggle menu visibility"
                                          >
                                            <Checkbox
                                              checked={exclusionJobMenuSettings.get(jobKey) ?? true}
                                              onChange={() => handleExclusionJobMenuToggle(jobKey)}
                                            />
                                            <span className="text-xs text-gray-600 dark:text-gray-400">
                                              Menu
                                            </span>
                                          </div>
                                          {/* Display Order with up/down arrows */}
                                          <div
                                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700"
                                            data-pr-tooltip="Display order (≥1 visible, ≤0 hidden)"
                                          >
                                            <span className="text-xs text-gray-600 dark:text-gray-400">
                                              Order
                                            </span>
                                            <span className="w-6 text-xs text-center font-medium text-gray-700 dark:text-gray-300">
                                              {exclusionJobDisplayOrder.get(jobKey) ?? ((exclusionJobMenuSettings.get(jobKey) ?? true) ? 1 : 0)}
                                            </span>
                                            <div className="flex flex-col">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const currentVal = exclusionJobDisplayOrder.get(jobKey) ?? 0;
                                                  handleExclusionDisplayOrderChange(jobKey, currentVal + 1);
                                                }}
                                                className="p-0 h-3 w-4 flex items-center justify-center text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-t"
                                              >
                                                <i className="pi pi-chevron-up" style={{ fontSize: '0.5rem' }} />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const currentVal = exclusionJobDisplayOrder.get(jobKey) ?? 0;
                                                  handleExclusionDisplayOrderChange(jobKey, currentVal - 1);
                                                }}
                                                className="p-0 h-3 w-4 flex items-center justify-center text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-b"
                                              >
                                                <i className="pi pi-chevron-down" style={{ fontSize: '0.5rem' }} />
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      <Tag
                                        value={`${excludedCount}/${job.permissions.length}`}
                                        severity={excludedCount > 0 ? 'warning' : 'secondary'}
                                        style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '8px', minWidth: '45px', textAlign: 'center' }}
                                      />
                                      {excludedCount > 0 && (
                                        <Tag
                                          value="excluded"
                                          severity="danger"
                                          style={{ padding: '4px 8px', fontSize: '0.7rem', borderRadius: '6px' }}
                                        />
                                      )}
                                      <i className={`pi ${isJobExpanded ? 'pi-chevron-down' : 'pi-chevron-right'} text-gray-400`} style={{ fontSize: '0.8rem' }} />
                                    </div>

                                    {/* Permissions - Nested inside job with tree indent */}
                                    {isJobExpanded && (
                                      <div className="mt-2 ml-6 pl-4 border-l-2 border-orange-200 dark:border-orange-600">
                                        <p className="text-xs text-gray-500 mb-2">
                                          Check the permissions you want to exclude from this user
                                        </p>
                                        <div className="flex flex-wrap gap-3">
                                          {job.permissions.map((perm) => (
                                            <div key={perm.name} className="flex items-center bg-white dark:bg-gray-800 px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-600">
                                              <Checkbox
                                                checked={jobPermissions.has(perm.name)}
                                                onChange={() => handleExclusionPermissionToggle(jobKey, perm.name)}
                                                label={perm.name}
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
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
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            onClick={() => handleNavigate(basePath)}
            disabled={loading}
            data-testid="UserRoleMappingForm.Button.Cancel"
          />
          <Button
            type="button"
            label={loading ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
            icon={loading ? 'pi pi-spin pi-spinner' : undefined}
            onClick={handleSubmit}
            disabled={loading}
            data-testid="UserRoleMappingForm.Button.Submit"
          />
        </div>
      </div>

      {/* Leave confirmation dialog */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="UserRoleMappingForm.Dialog.Leave"
      />
    </>
  );
};

export default UserRoleMappingForm;
