import { api } from './api';
import type { Module, ModuleCreateRequest, ModuleUpdateRequest, DeleteResponse, PaginatedResponse, EmbeddedJob, EmbeddedJobCreate, EmbeddedJobUpdate } from '../types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export interface ModuleQueryParams {
  include_deleted?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
  is_active?: boolean;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// Flattened job response (from /jobs/list endpoint)
export interface FlatJobResponse {
  moduleId: string;
  moduleName: string;
  moduleShortCode: string;
  name: string;
  shortCode: string;
  description?: string;
  displayName: string;
  route: string;
  menuEligibility: boolean;
  displayOrder: number;
  allowedPermissions: string[];
  permissionCount: number;
}

export const modulesService = {
  // ============================================================================
  // MODULE CRUD OPERATIONS
  // ============================================================================

  // Get all modules with pagination
  getAll: async (params?: ModuleQueryParams): Promise<PaginatedResponse<Module>> => {
    const response = await api.get<PaginatedResponse<Module>>('/api/v1/modules/list', { params });
    return response.data;
  },

  // Get all modules for dropdown (returns array, no pagination)
  getAllForDropdown: async (includeDeleted: boolean = false): Promise<Module[]> => {
    const response = await api.get<PaginatedResponse<Module>>('/api/v1/modules/list', {
      params: { include_deleted: includeDeleted },
    });
    return response.data.data || [];
  },

  // Get module by ID (includes embedded jobs)
  getById: async (id: string): Promise<Module> => {
    const response = await api.get<ApiResponse<Module>>(`/api/v1/modules/get/${id}`);
    return response.data.data;
  },

  // Create new module (can include jobs)
  create: async (payload: ModuleCreateRequest): Promise<Module> => {
    const response = await api.post<ApiResponse<Module>>('/api/v1/modules/create', payload);
    return response.data.data;
  },

  // Update module
  update: async (id: string, payload: ModuleUpdateRequest): Promise<Module> => {
    const response = await api.put<ApiResponse<Module>>(`/api/v1/modules/update/${id}`, payload);
    return response.data.data;
  },

  // Delete module (soft delete)
  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<ApiResponse<DeleteResponse>>(`/api/v1/modules/delete/${id}`);
    return response.data.data;
  },

  // Restore deleted module
  restore: async (id: string): Promise<Module> => {
    const response = await api.patch<ApiResponse<Module>>(`/api/v1/modules/restore/${id}`);
    return response.data.data;
  },

  // Toggle module active status
  toggleActive: async (id: string, isActive: boolean): Promise<Module> => {
    const response = await api.patch<ApiResponse<Module>>(`/api/v1/modules/active/${id}`, { isActive });
    return response.data.data;
  },

  // ============================================================================
  // JOB MANAGEMENT OPERATIONS
  // ============================================================================

  // Add a new job to a module
  addJob: async (moduleId: string, job: EmbeddedJobCreate): Promise<Module> => {
    const response = await api.post<ApiResponse<Module>>(`/api/v1/modules/${moduleId}/jobs`, job);
    return response.data.data;
  },

  // Update a job within a module (identified by job name)
  updateJob: async (moduleId: string, jobName: string, updates: EmbeddedJobUpdate): Promise<Module> => {
    const response = await api.put<ApiResponse<Module>>(`/api/v1/modules/${moduleId}/jobs/${encodeURIComponent(jobName)}`, updates);
    return response.data.data;
  },

  // Remove a job from a module
  removeJob: async (moduleId: string, jobName: string): Promise<Module> => {
    const response = await api.delete<ApiResponse<Module>>(`/api/v1/modules/${moduleId}/jobs/${encodeURIComponent(jobName)}`);
    return response.data.data;
  },

  // ============================================================================
  // PERMISSION MANAGEMENT OPERATIONS
  // ============================================================================

  // Add permissions to a job
  addPermissionsToJob: async (moduleId: string, jobName: string, permissions: string[]): Promise<Module> => {
    const response = await api.post<ApiResponse<Module>>(
      `/api/v1/modules/${moduleId}/jobs/${encodeURIComponent(jobName)}/permissions`,
      { allowedPermissions: permissions }
    );
    return response.data.data;
  },

  // Remove permissions from a job
  removePermissionsFromJob: async (moduleId: string, jobName: string, permissions: string[]): Promise<Module> => {
    const response = await api.delete<ApiResponse<Module>>(
      `/api/v1/modules/${moduleId}/jobs/${encodeURIComponent(jobName)}/permissions`,
      { data: { allowedPermissions: permissions } }
    );
    return response.data.data;
  },

  // ============================================================================
  // UTILITY OPERATIONS
  // ============================================================================

  // Get all jobs across all modules (flattened list)
  getAllJobs: async (): Promise<FlatJobResponse[]> => {
    const response = await api.get<ApiResponse<FlatJobResponse[]>>('/api/v1/modules/jobs/list');
    return response.data.data;
  },

  // Export modules as Excel file
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/modules/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};