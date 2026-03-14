import { api } from './api';
import type { Mandal, MandalCreateRequest, MandalUpdateRequest, DeleteResponse, PaginatedResponse } from '../types';

export interface MandalQueryParams {
  include_deleted?: boolean;
  search?: string;
  districtId?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const mandalsService = {
  getAll: async (params?: MandalQueryParams): Promise<PaginatedResponse<Mandal>> => {
    const response = await api.get<PaginatedResponse<Mandal>>('/api/v1/mandals/list', { params });
    return response.data;
  },

  /**
   * Get mandals for dropdown (no pagination, optionally filtered by districtId)
   */
  getAllForDropdown: async (districtId?: string): Promise<Mandal[]> => {
    const response = await api.get<PaginatedResponse<Mandal>>('/api/v1/mandals/list', {
      params: { include_deleted: false, page_size: 1000, ...(districtId && { districtId }) },
    });
    return response.data.data || [];
  },

  getById: async (id: string): Promise<Mandal> => {
    const response = await api.get<{ data: Mandal }>(`/api/v1/mandals/get/${id}`);
    return response.data.data;
  },

  create: async (data: MandalCreateRequest): Promise<Mandal> => {
    const response = await api.post<Mandal>('/api/v1/mandals/create', data);
    return response.data;
  },

  update: async (id: string, data: MandalUpdateRequest): Promise<Mandal> => {
    const response = await api.put<Mandal>(`/api/v1/mandals/update/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<DeleteResponse>(`/api/v1/mandals/delete/${id}`);
    return response.data;
  },

  restore: async (id: string): Promise<Mandal> => {
    const response = await api.patch<Mandal>(`/api/v1/mandals/restore/${id}`);
    return response.data;
  },

  // Get all mandals for export (fetches all records without pagination limit)
  getAllForExport: async (params?: Omit<MandalQueryParams, 'page' | 'page_size'>): Promise<Mandal[]> => {
    const response = await api.get<PaginatedResponse<Mandal>>('/api/v1/mandals/list', {
      params: { ...params, page_size: 1000 },
    });
    return response.data.data || [];
  },

  /**
   * Export mandals as Excel file
   * GET /api/v1/mandals/export
   */
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/mandals/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};
