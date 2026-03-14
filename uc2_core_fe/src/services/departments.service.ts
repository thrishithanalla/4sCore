import { api } from './api';
import type { Department, DepartmentCreateRequest, DepartmentUpdateRequest, DeleteResponse, PaginatedResponse } from '../types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export interface DepartmentQueryParams {
  include_deleted?: boolean;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const departmentsService = {
  // Get all departments
  getAll: async (params?: DepartmentQueryParams): Promise<PaginatedResponse<Department>> => {
    const response = await api.get<PaginatedResponse<Department>>('/api/v1/departments/list', { params });
    return response.data;
  },

  /**
   * Get all departments for dropdown (no pagination, fetches all records)
   */
  getAllForDropdown: async (): Promise<Department[]> => {
    const response = await api.get<PaginatedResponse<Department>>('/api/v1/departments/list', {
      params: {  include_deleted: false }
    });
    return response.data.data || [];
  },

  // Get department by ID
  getById: async (id: string): Promise<Department> => {
    const response = await api.get<ApiResponse<Department>>(`/api/v1/departments/get/${id}`);
    console.log('Department getById - full response:', response);
    console.log('Department getById - response.data:', response.data);
    console.log('Department getById - response.data.data:', response.data?.data);
    return response.data.data;
  },

  // Create new department
  create: async (payload: DepartmentCreateRequest): Promise<Department> => {
    const response = await api.post<ApiResponse<Department>>('/api/v1/departments/create', payload);
    return response.data.data;
  },

  // Update department
  update: async (id: string, payload: DepartmentUpdateRequest): Promise<Department> => {
    const response = await api.put<ApiResponse<Department>>(`/api/v1/departments/update/${id}`, payload);
    return response.data.data;
  },

  // Delete department (soft delete)
  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<ApiResponse<DeleteResponse>>(`/api/v1/departments/delete/${id}`);
    return response.data.data;
  },

  // Restore deleted department
  restore: async (id: string): Promise<Department> => {
    const response = await api.patch<ApiResponse<Department>>(`/api/v1/departments/restore/${id}`);
    return response.data.data;
  },

  // Get all departments for export (fetches all records without pagination limit)
  getAllForExport: async (params?: Omit<DepartmentQueryParams, 'page' | 'page_size'>): Promise<Department[]> => {
    const response = await api.get<PaginatedResponse<Department>>('/api/v1/departments/list', {
      params: { ...params, page_size: 1000 }, // Large page size to get all records
    });
    return response.data.data || [];
  },

  /**
   * Export departments as Excel file
   * GET /api/v1/departments/export
   */
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/departments/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};
