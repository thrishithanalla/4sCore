import { api } from './api';
import type { Rank, RankCreateRequest, RankUpdateRequest, DeleteResponse, PaginatedResponse } from '../types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export interface RankQueryParams {
  include_deleted?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const ranksService = {
  // Get all ranks
  getAll: async (params?: RankQueryParams): Promise<PaginatedResponse<Rank>> => {
    const response = await api.get<PaginatedResponse<Rank>>('/api/v1/ranks/list', { params });
    return response.data;
  },

  /**
   * Get all ranks for dropdown (no pagination, fetches all records)
   */
  getAllForDropdown: async (): Promise<Rank[]> => {
    const response = await api.get<PaginatedResponse<Rank>>('/api/v1/ranks/list', {
      params: {  include_deleted: false }
    });
    return response.data.data || [];
  },

  // Get rank by ID
  getById: async (id: string): Promise<Rank> => {
    const response = await api.get<ApiResponse<Rank>>(`/api/v1/ranks/get/${id}`);
    return response.data.data;
  },

  // Create new rank
  create: async (payload: RankCreateRequest): Promise<Rank> => {
    const response = await api.post<ApiResponse<Rank>>('/api/v1/ranks/create', payload);
    return response.data.data;
  },

  // Update rank
  update: async (id: string, payload: RankUpdateRequest): Promise<Rank> => {
    const response = await api.put<ApiResponse<Rank>>(`/api/v1/ranks/update/${id}`, payload);
    return response.data.data;
  },

  // Delete rank (soft delete)
  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<ApiResponse<DeleteResponse>>(`/api/v1/ranks/delete/${id}`);
    return response.data.data;
  },

  // Restore deleted rank
  restore: async (id: string): Promise<Rank> => {
    const response = await api.patch<ApiResponse<Rank>>(`/api/v1/ranks/restore/${id}`);
    return response.data.data;
  },

  // Get all ranks for export (uses provided page_size for export limit)
  getAllForExport: async (params?: Omit<RankQueryParams, 'page' | 'page_size'>, page_size: number = 1000): Promise<Rank[]> => {
    const response = await api.get<PaginatedResponse<Rank>>('/api/v1/ranks/list', {
      params: { ...params, page_size },
    });
    return response.data.data || [];
  },

  /**
   * Export ranks as Excel file
   * GET /api/v1/ranks/export
   */
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/ranks/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};