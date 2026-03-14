import { api } from './api';
import type { UnitType, UnitTypeCreateRequest, UnitTypeUpdateRequest, DeleteResponse, PaginatedResponse } from '../types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export interface UnitTypeQueryParams {
  include_deleted?: boolean;
  search?: string;
  departmentId?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const unitTypesService = {
  // Get all unit types
  getAll: async (params?: UnitTypeQueryParams): Promise<PaginatedResponse<UnitType>> => {
    const response = await api.get<PaginatedResponse<UnitType>>('/api/v1/unit-types/list', { params });
    return response.data;
  },

  /**
   * Get all unit types for dropdown (no pagination, fetches all records)
   */
  getAllForDropdown: async (departmentId?: string): Promise<UnitType[]> => {
    const response = await api.get<PaginatedResponse<UnitType>>('/api/v1/unit-types/list', {
      params: {  include_deleted: false, ...(departmentId && { departmentId }) }
    });
    return response.data.data || [];
  },

  // Get unit type by ID
  getById: async (id: string): Promise<UnitType> => {
    const response = await api.get<ApiResponse<UnitType>>(`/api/v1/unit-types/get/${id}`);
    return response.data.data;
  },

  // Create new unit type
  create: async (payload: UnitTypeCreateRequest): Promise<UnitType> => {
    const response = await api.post<ApiResponse<UnitType>>('/api/v1/unit-types/create', payload);
    return response.data.data;
  },

  // Update unit type
  update: async (id: string, payload: UnitTypeUpdateRequest): Promise<UnitType> => {
    const response = await api.put<ApiResponse<UnitType>>(`/api/v1/unit-types/update/${id}`, payload);
    return response.data.data;
  },

  // Delete unit type (soft delete)
  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<ApiResponse<DeleteResponse>>(`/api/v1/unit-types/delete/${id}`);
    return response.data.data;
  },

  // Restore deleted unit type
  restore: async (id: string): Promise<UnitType> => {
    const response = await api.patch<ApiResponse<UnitType>>(`/api/v1/unit-types/restore/${id}`);
    return response.data.data;
  },

  /**
   * Export unit types as Excel file
   * GET /api/v1/unit-types/export
   */
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/unit-types/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};