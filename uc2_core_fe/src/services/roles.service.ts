/**
 * Roles Service
 * Handles API calls for role management
 */

import { api } from './api';

// Module Hierarchy types from /api/v1/module-hierarchy/get
export interface ModuleHierarchyPermission {
  permissionId: string;
  name: string;
}

export interface ModuleHierarchyJob {
  jobId: string;
  name: string;
  displayName: string;
  route: string;
  menuEligible: boolean;  // Whether job is eligible to appear in menu (from jobs_master)
  displayOrder: number;
  permissions: ModuleHierarchyPermission[]; // Array of { permissionId, name } objects
}

// Helper type for permission that can be string or object
export type PermissionItem = string | ModuleHierarchyPermission;

export interface ModuleHierarchy {
  moduleId: string;
  moduleName: string;
  jobs: ModuleHierarchyJob[];
}

// Permission item with isSelf flag
export interface RolePermissionItem {
  name: string;
  isSelf: boolean;
}

// Role types from /api/v1/roles/list
// Note: permissions are now sent as {name, isSelf}[] format
export interface RoleJob {
  jobName: string;
  isMenu: boolean;
  displayOrder?: number;
  permissions: RolePermissionItem[]; // Array of permission objects with isSelf flag
}

export interface RoleModule {
  moduleId: string;
  moduleName: string;
  jobs: RoleJob[];
}

// Extended job with optional display properties (from single-module format)
export interface RoleJobExtended extends RoleJob {
  displayName?: string;
  route?: string;
}

// Raw API response - can have two formats:
// 1. Multi-module: permissions[] array containing modules with jobs
// 2. Single-module: moduleId, moduleName, jobs at root level
export interface RoleApiResponse {
  _id: string;
  name: string;
  shortCode: string;
  description: string;
  // Multi-module format
  permissions?: RoleModule[];
  // Single-module format
  moduleId?: string;
  moduleName?: string;
  jobs?: RoleJobExtended[];
  // Common fields
  isDelete: boolean;
  isActive?: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt?: string | null;
}

// Normalized Role interface (always has permissions array)
export interface Role {
  _id: string;
  name: string;
  shortCode: string;
  description: string;
  permissions: RoleModule[];
  // Keep original fields for single-module display
  moduleId?: string;
  moduleName?: string;
  jobs?: RoleJobExtended[];
  isDelete: boolean;
  isActive?: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

/**
 * Normalize role data to always have permissions array
 * Handles both multi-module and single-module formats
 */
export const normalizeRole = (role: RoleApiResponse): Role => {
  // If permissions array exists, it's multi-module format
  if (role.permissions && Array.isArray(role.permissions) && role.permissions.length > 0) {
    return {
      ...role,
      permissions: role.permissions,
      deletedBy: role.deletedBy || null,
      deletedAt: role.deletedAt || null,
    } as Role;
  }

  // Single-module format - convert to permissions array
  if (role.moduleId && role.jobs) {
    return {
      ...role,
      permissions: [{
        moduleId: role.moduleId,
        moduleName: role.moduleName || '',
        jobs: role.jobs,
      }],
      deletedBy: role.deletedBy || null,
      deletedAt: role.deletedAt || null,
    } as Role;
  }

  // Fallback - return with empty permissions
  return {
    ...role,
    permissions: role.permissions || [],
    deletedBy: role.deletedBy || null,
    deletedAt: role.deletedAt || null,
  } as Role;
}

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

import type { PaginatedResponse } from '../types';

export interface RoleQueryParams {
  include_deleted?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
  module?: string;
  module_id?: string;
}

/**
 * Fetch all roles from /api/v1/roles/list
 */
export const fetchRoles = async (params?: RoleQueryParams): Promise<PaginatedResponse<Role>> => {
  try {
    const response = await api.get<PaginatedResponse<RoleApiResponse>>('/api/v1/roles/list', { params });
    // Normalize each role to ensure consistent structure
    return {
      ...response.data,
      data: (response.data.data || []).map(normalizeRole),
    };
  } catch (error) {
    console.error('Error fetching roles:', error);
    throw error;
  }
};

/**
 * Fetch all roles for dropdown (returns array, no pagination)
 */
export const fetchRolesForDropdown = async (): Promise<Role[]> => {
  try {
    const response = await api.get<PaginatedResponse<RoleApiResponse>>('/api/v1/roles/list', {
      params: {  include_deleted: false },
    });
    // Normalize each role
    return (response.data.data || []).map(normalizeRole);
  } catch (error) {
    console.error('Error fetching roles for dropdown:', error);
    throw error;
  }
};

/**
 * Get role by ID from /api/v1/roles/get/{id}
 */
export const getRoleById = async (id: string): Promise<Role> => {
  try {
    const response = await api.get<ApiResponse<RoleApiResponse>>(`/api/v1/roles/get/${id}`);
    // Normalize the role data
    return normalizeRole(response.data.data);
  } catch (error) {
    console.error('Error fetching role:', error);
    throw error;
  }
};

/**
 * Delete a role by ID
 */
export const deleteRole = async (id: string): Promise<void> => {
  try {
    await api.delete(`/api/v1/roles/delete/${id}`);
  } catch (error) {
    console.error('Error deleting role:', error);
    throw error;
  }
};

// Payload type for create/update role (single-module format)
export interface RoleCreateUpdatePayload {
  name: string;
  shortCode: string;
  description?: string;
  moduleId: string;
  moduleName: string;
  jobs: RoleJob[];
}

/**
 * Create a new role
 * Payload uses single-module format: moduleId, moduleName, jobs at root level
 */
export const createRole = async (payload: RoleCreateUpdatePayload): Promise<Role> => {
  try {
    const response = await api.post<ApiResponse<RoleApiResponse>>('/api/v1/roles/create', payload);
    return normalizeRole(response.data.data);
  } catch (error) {
    console.error('Error creating role:', error);
    throw error;
  }
};

/**
 * Update an existing role
 * Payload uses single-module format: moduleId, moduleName, jobs at root level
 */
export const updateRole = async (
  id: string,
  payload: RoleCreateUpdatePayload
): Promise<Role> => {
  try {
    const response = await api.put<ApiResponse<RoleApiResponse>>(`/api/v1/roles/update/${id}`, payload);
    return normalizeRole(response.data.data);
  } catch (error) {
    console.error('Error updating role:', error);
    throw error;
  }
};

/**
 * Fetch module hierarchy for role access
 * Returns modules with their jobs and permissions from /api/v1/module-hierarchy/get
 */
export const fetchModuleHierarchy = async (): Promise<ModuleHierarchy[]> => {
  try {
    const response = await api.get<ApiResponse<ModuleHierarchy[]>>('/api/v1/module-hierarchy/get');
    return response.data.data;
  } catch (error) {
    console.error('Error fetching module hierarchy:', error);
    throw error;
  }
};

/**
 * Get jobs for selected modules from hierarchy
 */
export const getJobsForSelectedModules = (
  moduleHierarchy: ModuleHierarchy[],
  selectedModuleIds: string[]
): ModuleHierarchy[] => {
  if (!selectedModuleIds || selectedModuleIds.length === 0) {
    return [];
  }

  return moduleHierarchy.filter((module) => selectedModuleIds.includes(module.moduleId));
};

/**
 * Export roles as Excel file
 */
export const exportRoles = async (): Promise<Blob> => {
  const response = await api.get('/api/v1/roles/export', {
    responseType: 'blob',
  });
  return response.data;
};
