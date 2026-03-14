/**
 * Permission Mapping Service
 * Handles API calls for module-job-permission mappings
 * Based on /api/v1/permissions-mapping endpoints
 */

import { api } from './api';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

import type { PaginatedResponse } from '../types';

// Types
export interface PermissionMapping {
  _id: string;
  moduleId: string;
  moduleName?: string;
  jobId: string;
  jobName?: string;
  permissionId: string;
  permissionName?: string;
  isActive: boolean;
  isDelete: boolean;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface PermissionMappingCreateRequest {
  moduleId: string;
  jobId: string;
  permissionId: string;
}

export interface PermissionMappingUpdateRequest {
  moduleId?: string;
  jobId?: string;
  permissionId?: string;
}

export interface PermissionMappingSearchParams {
  page?: number;
  page_size?: number;
  moduleId?: string;
  jobId?: string;
  permissionId?: string;
  include_deleted?: boolean;
}

export interface BulkCreateResponse {
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  successful: Array<{
    id: string;
    moduleId: string;
    jobId: string;
    permissionId: string;
  }>;
  failed: Array<{
    data: {
      moduleId: string;
      jobId: string;
      permissionId: string;
    };
    error: string;
  }>;
}

interface CreateResult {
  success: boolean;
  data?: PermissionMapping | BulkCreateResponse;
  error?: string;
}

/**
 * Fetch all permission mappings with optional filters
 */
export const fetchPermissionMappings = async (
  params?: PermissionMappingSearchParams
): Promise<PaginatedResponse<PermissionMapping>> => {
  try {
    const response = await api.get<PaginatedResponse<PermissionMapping>>(
      '/api/v1/permissions-mapping/list',
      { params }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching permission mappings:', error);
    throw error;
  }
};

/**
 * Get permission mapping by ID
 */
export const getPermissionMappingById = async (id: string): Promise<PermissionMapping> => {
  try {
    const response = await api.get<ApiResponse<PermissionMapping>>(
      `/api/v1/permissions-mapping/get/${id}`
    );
    return response.data.data;
  } catch (error) {
    console.error('Error fetching permission mapping:', error);
    throw error;
  }
};

/**
 * Create permission mapping(s) - handles both single and bulk creation
 * @param moduleId - Module ID
 * @param jobId - Job ID
 * @param permissionIds - Array of permission IDs (single or multiple)
 */
export const createPermissionMappings = async (
  moduleId: string,
  jobId: string,
  permissionIds: string[]
): Promise<CreateResult> => {
  try {
    if (permissionIds.length === 1) {
      // Single creation
      const response = await api.post<ApiResponse<PermissionMapping>>(
        '/api/v1/permissions-mapping/create',
        {
          moduleId,
          jobId,
          permissionId: permissionIds[0],
        }
      );
      return { success: true, data: response.data.data };
    } else {
      // Bulk creation - send array of objects with moduleId, jobId, permissionId
      const payload = permissionIds.map((permissionId) => ({
        moduleId,
        jobId,
        permissionId,
      }));
      const response = await api.post<ApiResponse<BulkCreateResponse>>(
        '/api/v1/permissions-mapping/bulk-create',
        payload
      );
      return { success: true, data: response.data.data };
    }
  } catch (error: any) {
    console.error('Error creating permission mapping(s):', error);
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Failed to create permission mapping(s)',
    };
  }
};

/**
 * Create single permission mapping
 */
export const createPermissionMapping = async (
  payload: PermissionMappingCreateRequest
): Promise<PermissionMapping> => {
  try {
    const response = await api.post<ApiResponse<PermissionMapping>>(
      '/api/v1/permissions-mapping/create',
      payload
    );
    return response.data.data;
  } catch (error) {
    console.error('Error creating permission mapping:', error);
    throw error;
  }
};

/**
 * Update permission mapping
 */
export const updatePermissionMapping = async (
  id: string,
  payload: PermissionMappingUpdateRequest
): Promise<PermissionMapping> => {
  try {
    const response = await api.put<ApiResponse<PermissionMapping>>(
      `/api/v1/permissions-mapping/update/${id}`,
      payload
    );
    return response.data.data;
  } catch (error) {
    console.error('Error updating permission mapping:', error);
    throw error;
  }
};

/**
 * Delete permission mapping (soft delete)
 */
export const deletePermissionMapping = async (id: string): Promise<{ message: string }> => {
  try {
    const response = await api.delete<ApiResponse<{ message: string }>>(
      `/api/v1/permissions-mapping/delete/${id}`
    );
    return response.data.data;
  } catch (error) {
    console.error('Error deleting permission mapping:', error);
    throw error;
  }
};

/**
 * Restore deleted permission mapping
 */
export const restorePermissionMapping = async (id: string): Promise<PermissionMapping> => {
  try {
    const response = await api.patch<ApiResponse<PermissionMapping>>(
      `/api/v1/permissions-mapping/restore/${id}`
    );
    return response.data.data;
  } catch (error) {
    console.error('Error restoring permission mapping:', error);
    throw error;
  }
};

/**
 * Module-Job mapping response type from jobs-by-module API
 */
export interface ModuleJobMappingResponse {
  _id: string;
  moduleId: string;
  jobId: string;
  moduleName?: string;
  jobName?: string;
  isActive?: boolean;
  isDelete?: boolean;
}

/**
 * Job type for dropdown options (normalized from API response)
 */
export interface JobByModule {
  _id: string;
  name: string;
}

/**
 * Fetch jobs by module ID
 * Uses the module-job-mapping endpoint to get jobs associated with a specific module
 * Returns normalized job data for dropdown options
 */
export const getJobsByModule = async (moduleId: string): Promise<JobByModule[]> => {
  try {
    const response = await api.get<ApiResponse<ModuleJobMappingResponse[]>>(
      `/api/v1/module-job-mapping/jobs-by-module/${moduleId}`,
      { params: { include_deleted: false } }
    );

    // Transform API response to normalized job format
    // API returns: { jobId, jobName, ... }
    // We need: { _id, name }
    const mappings = response.data.data || [];
    return mappings
      .filter((m) => m.jobName) // Filter out entries with empty jobName
      .map((m) => ({
        _id: m.jobId,
        name: m.jobName || '',
      }));
  } catch (error) {
    console.error('Error fetching jobs by module:', error);
    throw error;
  }
};
