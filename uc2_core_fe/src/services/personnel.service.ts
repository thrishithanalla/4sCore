import { api } from './api';
import type { Personnel, PersonnelCreateRequest, DeleteResponse, PaginatedResponse } from '../types';

export interface PersonnelQueryParams {
  include_deleted?: boolean;
  isActive?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const personnelService = {
  getAll: async (params?: PersonnelQueryParams): Promise<PaginatedResponse<Personnel>> => {
    const response = await api.get<PaginatedResponse<Personnel>>('/api/v1/personnel-master/list', { params });
    return response.data;
  },

  // Get all personnel for dropdown (returns array, no pagination)
  getAllForDropdown: async (): Promise<Personnel[]> => {
    const response = await api.get<PaginatedResponse<Personnel>>('/api/v1/personnel-master/list', {
      params: {  include_deleted: false },
    });
    return response.data.data || [];
  },

  getById: async (id: string): Promise<Personnel> => {
    const response = await api.get<{ data: Personnel }>(`/api/v1/personnel-master/${id}`);
    return response.data.data;
  },

  create: async (data: PersonnelCreateRequest): Promise<Personnel> => {
    const response = await api.post<{ data: Personnel }>('/api/v1/personnel-master/create', data);
    return response.data.data;
  },

  update: async (id: string, data: Partial<PersonnelCreateRequest>): Promise<Personnel> => {
    const response = await api.patch<{ data: Personnel }>(`/api/v1/personnel-master/update/${id}`, data);
    return response.data.data;
  },

  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<{ data: DeleteResponse }>(`/api/v1/personnel-master/delete/${id}`);
    return response.data.data;
  },

  // Update active status (activate/deactivate personnel)
  updateActiveStatus: async (id: string, isActive: boolean): Promise<Personnel> => {
    const response = await api.patch<{ data: Personnel }>(`/api/v1/personnel-master/update-active-status/${id}`, { isActive });
    return response.data.data;
  },

  // Get all personnel for export (fetches all records without pagination limit)
  getAllForExport: async (params?: Omit<PersonnelQueryParams, 'page' | 'page_size'>): Promise<Personnel[]> => {
    const response = await api.get<PaginatedResponse<Personnel>>('/api/v1/personnel-master/list', {
      params: { ...params, page_size: 1000 }, // Large page size to get all records
    });
    return response.data.data || [];
  },

  /**
   * Export personnel as Excel file
   * GET /api/v1/personnel-master/export
   */
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/personnel-master/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};
