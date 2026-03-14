import { api } from './api';
import type { Level, LevelCreateRequest, LevelUpdateRequest, DeleteResponse, PaginatedResponse, LevelChildUnit } from '../types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export interface LevelQueryParams {
  include_deleted?: boolean;
  search?: string;
  departmentId?: string;
  page?: number;
  page_size?: number;
}

export const levelsService = {
  // Get all levels
  getAll: async (params?: LevelQueryParams): Promise<PaginatedResponse<Level>> => {
    const response = await api.get<PaginatedResponse<Level>>('/api/v1/levels/list', { params });
    return response.data;
  },

  /**
   * Get all levels for dropdown (no pagination, fetches all records)
   */
  getAllForDropdown: async (departmentId?: string): Promise<Level[]> => {
    const response = await api.get<PaginatedResponse<Level>>('/api/v1/levels/list', {
      params: { include_deleted: false, ...(departmentId && { departmentId }) }
    });
    return response.data.data || [];
  },

  // Get level by ID
  getById: async (id: string): Promise<Level> => {
    const response = await api.get<ApiResponse<Level>>(`/api/v1/levels/get/${id}`);
    return response.data.data;
  },

  // Get level statistics (units count, personnel, vacancies)
  getStatistics: async (id: string): Promise<{
    totalUnits: number;
    totalPersonnel: number;
    childUnits: number;
    vacantPositions: number;
  }> => {
    const response = await api.get<ApiResponse<{
      totalUnits: number;
      totalPersonnel: number;
      childUnits: number;
      vacantPositions: number;
    }>>(`/api/v1/levels/${id}/statistics`);
    return response.data.data;
  },

  // Get child units for a level
  getChildUnits: async (id: string, params?: { page?: number; page_size?: number }): Promise<PaginatedResponse<LevelChildUnit>> => {
    const response = await api.get<PaginatedResponse<LevelChildUnit>>(`/api/v1/levels/${id}/units`, { params });
    return response.data;
  },

  // Create new level
  create: async (payload: LevelCreateRequest): Promise<Level> => {
    const response = await api.post<ApiResponse<Level>>('/api/v1/levels/create', payload);
    return response.data.data;
  },

  // Update level
  update: async (id: string, payload: LevelUpdateRequest): Promise<Level> => {
    const response = await api.put<ApiResponse<Level>>(`/api/v1/levels/update/${id}`, payload);
    return response.data.data;
  },

  // Delete level (soft delete)
  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<ApiResponse<DeleteResponse>>(`/api/v1/levels/delete/${id}`);
    return response.data.data;
  },

  // Restore deleted level
  restore: async (id: string): Promise<Level> => {
    const response = await api.patch<ApiResponse<Level>>(`/api/v1/levels/restore/${id}`);
    return response.data.data;
  },
};
