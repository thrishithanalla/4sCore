import { api } from './api';
import type { District, DistrictCreateRequest, DistrictUpdateRequest, DeleteResponse, PaginatedResponse } from '../types';

export interface DistrictQueryParams {
  include_deleted?: boolean;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const districtsService = {
  getAll: async (params?: DistrictQueryParams): Promise<PaginatedResponse<District>> => {
    console.log('Districts Service - getAll called with params:', params);
    const response = await api.get<PaginatedResponse<District>>('/api/v1/districts/list', { params });
    console.log('Districts Service - API response:', response.config.url, response.config.params);
    return response.data;
  },

  /**
   * Get all districts for dropdown (no pagination, fetches all records)
   */
  getAllForDropdown: async (): Promise<District[]> => {
    const response = await api.get<PaginatedResponse<District>>('/api/v1/districts/list', {
      params: {  include_deleted: false }
    });
    return response.data.data || [];
  },

  getById: async (id: string): Promise<District> => {
    const response = await api.get<{ data: District }>(`/api/v1/districts/get/${id}`);
    return response.data.data;
  },

  create: async (data: DistrictCreateRequest): Promise<District> => {
    const response = await api.post<District>('/api/v1/districts/create', data);
    return response.data;
  },

  update: async (id: string, data: DistrictUpdateRequest): Promise<District> => {
    const response = await api.put<District>(`/api/v1/districts/update/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<DeleteResponse>(`/api/v1/districts/delete/${id}`);
    return response.data;
  },

  restore: async (id: string): Promise<District> => {
    console.log('Districts Service - restore called for district:', id);
    const response = await api.patch<District>(`/api/v1/districts/restore/${id}`);
    console.log('Districts Service - restore response:', response.data);
    return response.data;
  },

  // Get all districts for export (uses provided page_size for export limit)
  getAllForExport: async (params?: Omit<DistrictQueryParams, 'page' | 'page_size'>, page_size: number = 1000): Promise<District[]> => {
    const response = await api.get<PaginatedResponse<District>>('/api/v1/districts/list', {
      params: { ...params, page_size },
    });
    return response.data.data || [];
  },

  /**
   * Export districts as Excel file
   * GET /api/v1/districts/export
   */
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/districts/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};
