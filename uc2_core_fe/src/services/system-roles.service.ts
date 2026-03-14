/**
 * System Roles Service
 * Handles API calls for system role management
 */

import { api } from './api';
import type { PaginatedResponse } from '../types';
import type {
  SystemRole,
  SystemRoleQueryParams,
  CreateSystemRolePayload,
  UpdateSystemRolePayload,
  ModuleWithRoles,
} from '../types/system-role.types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

/**
 * Fetch all system roles from /api/v1/system-roles/list
 */
export const fetchSystemRoles = async (
  params?: SystemRoleQueryParams
): Promise<PaginatedResponse<SystemRole>> => {
  try {
    const response = await api.get<PaginatedResponse<SystemRole>>(
      '/api/v1/system-roles/list',
      { params }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching system roles:', error);
    throw error;
  }
};

/**
 * Fetch all system roles for dropdown (returns array, no pagination)
 */
export const fetchSystemRolesForDropdown = async (): Promise<SystemRole[]> => {
  try {
    const response = await api.get<any>(
      '/api/v1/system-roles/list',
      { params: { include_deleted: false } }
    );
    // Handle both formats: direct array or paginated response
    const data = response.data;
    if (Array.isArray(data)) {
      return data;
    }
    // Paginated response format
    return data?.data || [];
  } catch (error) {
    console.error('Error fetching system roles for dropdown:', error);
    throw error;
  }
};

/**
 * Export system roles as Excel file
 */
export const exportSystemRoles = async (): Promise<Blob> => {
  const response = await api.get('/api/v1/system-roles/export', {
    responseType: 'blob',
  });
  return response.data;
};

/**
 * Get system role by ID from /api/v1/system-roles/get/{id}
 */
export const getSystemRoleById = async (id: string): Promise<SystemRole> => {
  try {
    const response = await api.get<ApiResponse<SystemRole>>(
      `/api/v1/system-roles/get/${id}`
    );
    return response.data.data;
  } catch (error) {
    console.error('Error fetching system role:', error);
    throw error;
  }
};

/**
 * Create a new system role
 */
export const createSystemRole = async (
  payload: CreateSystemRolePayload
): Promise<SystemRole> => {
  try {
    const response = await api.post<ApiResponse<SystemRole>>(
      '/api/v1/system-roles/create',
      payload
    );
    return response.data.data;
  } catch (error) {
    console.error('Error creating system role:', error);
    throw error;
  }
};

/**
 * Update an existing system role
 */
export const updateSystemRole = async (
  id: string,
  payload: UpdateSystemRolePayload
): Promise<SystemRole> => {
  try {
    const response = await api.put<ApiResponse<SystemRole>>(
      `/api/v1/system-roles/update/${id}`,
      payload
    );
    return response.data.data;
  } catch (error) {
    console.error('Error updating system role:', error);
    throw error;
  }
};

/**
 * Delete a system role by ID (soft delete)
 */
export const deleteSystemRole = async (id: string): Promise<void> => {
  try {
    await api.delete(`/api/v1/system-roles/delete/${id}`);
  } catch (error) {
    console.error('Error deleting system role:', error);
    throw error;
  }
};

/**
 * Restore a deleted system role
 */
export const restoreSystemRole = async (id: string): Promise<void> => {
  try {
    await api.patch(`/api/v1/system-roles/restore/${id}`);
  } catch (error) {
    console.error('Error restoring system role:', error);
    throw error;
  }
};

/**
 * Fetch modules with their roles for the permissions dropdown
 * Returns modules with nested roles array for dynamic form
 */
export const fetchModulesWithRoles = async (): Promise<ModuleWithRoles[]> => {
  try {
    const response = await api.get<ApiResponse<ModuleWithRoles[]>>(
      '/api/v1/system-roles/modules-with-roles'
    );
    return response.data.data;
  } catch (error) {
    console.error('Error fetching modules with roles:', error);
    throw error;
  }
};

// Service object for easier imports
export const systemRolesService = {
  getAll: fetchSystemRoles,
  getAllForDropdown: fetchSystemRolesForDropdown,
  export: exportSystemRoles,
  getById: getSystemRoleById,
  create: createSystemRole,
  update: updateSystemRole,
  delete: deleteSystemRole,
  restore: restoreSystemRole,
  getModulesWithRoles: fetchModulesWithRoles,
};
