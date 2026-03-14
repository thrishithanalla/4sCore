/**
 * Module-Job Mapping Service
 * Handles API calls for module-job mappings
 * Based on /api/v1/module-job-mapping endpoints
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
export interface ModuleJobMapping {
  _id: string;
  moduleId: string;
  moduleName?: string;
  jobId: string;
  jobName?: string;
  isActive: boolean;
  isDelete: boolean;
  createdBy: string | null;
  createdAt: string | null;
  createdIp?: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  updatedIp?: string | null;
}

export interface ModuleJobMappingCreateRequest {
  moduleId: string;
  jobId: string;
}

export interface ModuleJobMappingUpdateRequest {
  moduleId?: string;
  jobId?: string;
  isActive?: boolean;
}

export interface ModuleJobMappingSearchParams {
  page?: number;
  page_size?: number;
  moduleId?: string;
  jobId?: string;
  include_deleted?: boolean;
}

export interface BulkCreateResponse {
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  successful: Array<{
    index: number;
    id: string;
    moduleId: string;
    jobId: string;
  }>;
  failed: Array<{
    index: number;
    data: {
      moduleId: string;
      jobId: string;
    };
    error: string;
  }>;
}

interface CreateResult {
  success: boolean;
  data?: ModuleJobMapping | BulkCreateResponse;
  error?: string;
}

/**
 * Fetch all module-job mappings with optional filters
 */
export const fetchModuleJobMappings = async (
  params?: ModuleJobMappingSearchParams
): Promise<PaginatedResponse<ModuleJobMapping>> => {
  try {
    const response = await api.get<PaginatedResponse<ModuleJobMapping>>(
      '/api/v1/module-job-mapping/list',
      { params }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching module-job mappings:', error);
    throw error;
  }
};

/**
 * Get module-job mapping by ID
 */
export const getModuleJobMappingById = async (id: string): Promise<ModuleJobMapping> => {
  try {
    const response = await api.get<ApiResponse<ModuleJobMapping>>(
      `/api/v1/module-job-mapping/get/${id}`
    );
    return response.data.data;
  } catch (error) {
    console.error('Error fetching module-job mapping:', error);
    throw error;
  }
};

/**
 * Get jobs by module ID
 */
export const getJobsByModule = async (
  moduleId: string,
  params?: { include_deleted?: boolean; page?: number; page_size?: number }
): Promise<ModuleJobMapping[]> => {
  try {
    const response = await api.get<PaginatedResponse<ModuleJobMapping>>(
      `/api/v1/module-job-mapping/jobs-by-module/${moduleId}`,
      { params }
    );
    return response.data.data;
  } catch (error) {
    console.error('Error fetching jobs by module:', error);
    throw error;
  }
};

/**
 * Get modules by job ID
 */
export const getModulesByJob = async (
  jobId: string,
  params?: { include_deleted?: boolean; page?: number; page_size?: number }
): Promise<ModuleJobMapping[]> => {
  try {
    const response = await api.get<PaginatedResponse<ModuleJobMapping>>(
      `/api/v1/module-job-mapping/modules-by-job/${jobId}`,
      { params }
    );
    return response.data.data;
  } catch (error) {
    console.error('Error fetching modules by job:', error);
    throw error;
  }
};

/**
 * Create module-job mapping(s) - handles both single and bulk creation
 * @param moduleId - Module ID
 * @param jobIds - Array of job IDs (single or multiple)
 */
export const createModuleJobMappings = async (
  moduleId: string,
  jobIds: string[]
): Promise<CreateResult> => {
  try {
    if (jobIds.length === 1) {
      // Single creation
      const response = await api.post<ApiResponse<ModuleJobMapping>>(
        '/api/v1/module-job-mapping/create',
        {
          moduleId,
          jobId: jobIds[0],
        }
      );
      return { success: true, data: response.data.data };
    } else {
      // Bulk creation - send array of objects with moduleId, jobId
      const payload = jobIds.map((jobId) => ({
        moduleId,
        jobId,
      }));
      const response = await api.post<ApiResponse<BulkCreateResponse>>(
        '/api/v1/module-job-mapping/bulk-create',
        payload
      );
      return { success: true, data: response.data.data };
    }
  } catch (error: any) {
    console.error('Error creating module-job mapping(s):', error);
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Failed to create module-job mapping(s)',
    };
  }
};

/**
 * Create single module-job mapping
 */
export const createModuleJobMapping = async (
  payload: ModuleJobMappingCreateRequest
): Promise<ModuleJobMapping> => {
  try {
    const response = await api.post<ApiResponse<ModuleJobMapping>>(
      '/api/v1/module-job-mapping/create',
      payload
    );
    return response.data.data;
  } catch (error) {
    console.error('Error creating module-job mapping:', error);
    throw error;
  }
};

/**
 * Update module-job mapping
 */
export const updateModuleJobMapping = async (
  id: string,
  payload: ModuleJobMappingUpdateRequest
): Promise<ModuleJobMapping> => {
  try {
    const response = await api.put<ApiResponse<ModuleJobMapping>>(
      `/api/v1/module-job-mapping/update/${id}`,
      payload
    );
    return response.data.data;
  } catch (error) {
    console.error('Error updating module-job mapping:', error);
    throw error;
  }
};

/**
 * Delete module-job mapping (soft delete)
 */
export const deleteModuleJobMapping = async (id: string): Promise<{ message: string }> => {
  try {
    const response = await api.delete<ApiResponse<null>>(
      `/api/v1/module-job-mapping/delete/${id}`
    );
    return { message: response.data.message };
  } catch (error) {
    console.error('Error deleting module-job mapping:', error);
    throw error;
  }
};

/**
 * Restore deleted module-job mapping
 */
export const restoreModuleJobMapping = async (id: string): Promise<ModuleJobMapping> => {
  try {
    const response = await api.patch<ApiResponse<null>>(
      `/api/v1/module-job-mapping/restore/${id}`
    );
    return response.data.data as unknown as ModuleJobMapping;
  } catch (error) {
    console.error('Error restoring module-job mapping:', error);
    throw error;
  }
};
