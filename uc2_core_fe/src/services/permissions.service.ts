import { api } from './api';
import type { Permission, PermissionCreateRequest, PermissionUpdateRequest, DeleteResponse, PaginatedResponse } from '../types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export interface PermissionQueryParams {
  page?: number;
  page_size?: number;
  search?: string;
  include_deleted?: boolean;
}

export const permissionsService = {
  // Get all permissions with pagination
  getAll: async (params?: PermissionQueryParams): Promise<PaginatedResponse<Permission>> => {
    const response = await api.get<PaginatedResponse<Permission>>('/api/v1/permissions/list', { params });
    return response.data;
  },

  // Get all permissions for dropdown (returns array, no pagination)
  getAllForDropdown: async (): Promise<Permission[]> => {
    const response = await api.get<PaginatedResponse<Permission>>('/api/v1/permissions/list', {
      params: {  include_deleted: false },
    });
    return response.data.data || [];
  },

  // Get permission by ID
  getById: async (id: string): Promise<Permission> => {
    const response = await api.get<ApiResponse<Permission>>(`/api/v1/permissions/get/${id}`);
    return response.data.data;
  },

  // Create new permission
  create: async (payload: PermissionCreateRequest): Promise<Permission> => {
    const response = await api.post<ApiResponse<Permission>>('/api/v1/permissions/create', payload);
    return response.data.data;
  },

  // Update permission
  update: async (id: string, payload: PermissionUpdateRequest): Promise<Permission> => {
    const response = await api.put<ApiResponse<Permission>>(`/api/v1/permissions/update/${id}`, payload);
    return response.data.data;
  },

  // Delete permission (soft delete)
  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<ApiResponse<DeleteResponse>>(`/api/v1/permissions/delete/${id}`);
    return response.data.data;
  },

  // Restore deleted permission
  restore: async (id: string): Promise<Permission> => {
    const response = await api.patch<ApiResponse<Permission>>(`/api/v1/permissions/restore/${id}`);
    return response.data.data;
  },

  // Get all permissions for export (fetches all records without pagination limit)
  getAllForExport: async (params?: Omit<PermissionQueryParams, 'page' | 'page_size'>): Promise<Permission[]> => {
    const response = await api.get<PaginatedResponse<Permission>>('/api/v1/permissions/list', {
      params: { ...params, page_size: 1000 },
    });
    return response.data.data || [];
  },

  // Add permissions to a job within a module (same format as job creation)
  addToJob: async (moduleId: string, jobId: string, allowedPermissions: string[]): Promise<void> => {
    await api.post(
      `/api/v1/modules/${moduleId}/jobs/${jobId}/permissions`,
      { allowedPermissions }
    );
  },
};
