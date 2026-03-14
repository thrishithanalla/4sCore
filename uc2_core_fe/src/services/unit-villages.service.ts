import { api } from './api';
import type { UnitVillage, UnitVillageCreateRequest, DeleteResponse, PaginatedResponse } from '../types';

export interface UnitVillageQueryParams {
  search?: string;
  unitId?: string;
  mandalId?: string;
  include_deleted?: boolean;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const unitVillagesService = {
  getAll: async (params?: UnitVillageQueryParams): Promise<PaginatedResponse<UnitVillage>> => {
    const response = await api.get<PaginatedResponse<UnitVillage>>('/api/v1/unit-villages/list', { params });
    return response.data;
  },

  /**
   * Get all unit villages for dropdown (no pagination, fetches all records)
   */
  getAllForDropdown: async (unitId?: string): Promise<UnitVillage[]> => {
    const response = await api.get<PaginatedResponse<UnitVillage>>('/api/v1/unit-villages/list', {
      params: {  include_deleted: false, ...(unitId && { unitId }) }
    });
    return response.data.data || [];
  },

  getById: async (id: string): Promise<UnitVillage> => {
    const response = await api.get<{ data: UnitVillage }>(`/api/v1/unit-villages/get/${id}`);
    return response.data.data;
  },

  create: async (data: UnitVillageCreateRequest): Promise<UnitVillage> => {
    const response = await api.post<UnitVillage>('/api/v1/unit-villages/create', data);
    return response.data;
  },

  update: async (id: string, data: Partial<UnitVillageCreateRequest>): Promise<UnitVillage> => {
    const response = await api.put<UnitVillage>(`/api/v1/unit-villages/update/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<DeleteResponse>(`/api/v1/unit-villages/delete/${id}`);
    return response.data;
  },

  restore: async (id: string): Promise<UnitVillage> => {
    const response = await api.patch<UnitVillage>(`/api/v1/unit-villages/restore/${id}`);
    return response.data;
  },

  // Get all unit villages for export (fetches all records without pagination limit)
  getAllForExport: async (params?: Omit<UnitVillageQueryParams, 'page' | 'page_size'>): Promise<UnitVillage[]> => {
    const response = await api.get<PaginatedResponse<UnitVillage>>('/api/v1/unit-villages/list', {
      params: { ...params, page_size: 1000 }, // Large page size to get all records
    });
    return response.data.data || [];
  },

  /**
   * Export unit villages as Excel file
   * GET /api/v1/unit-villages/export
   */
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/unit-villages/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};
