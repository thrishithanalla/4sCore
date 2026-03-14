import { api } from './api';
import type { PaginatedResponse } from '../types';

// Types
export interface DesignationMaster {
  _id: string;
  name: string;
  designationCode: string;
  isActive: boolean;
  isDelete: boolean;
  createdBy?: string;
  createdAt?: string;
  createdIp?: string;
  updatedBy?: string;
  updatedAt?: string;
  updatedIp?: string;
}

export interface DesignationMasterCreateRequest {
  name: string;
  designationCode: string; // Required field
}

export interface DesignationMasterUpdateRequest {
  name?: string;
  designationCode?: string;
}

export interface DesignationMasterQueryParams {
  search?: string;
  include_deleted?: boolean;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
  error?: {
    errorCode: string;
    details?: string;
  };
}

export const designationMasterService = {
  /**
   * Get all designation masters with optional filters
   * GET /api/v1/designation-master/list
   */
  getAll: async (params?: DesignationMasterQueryParams): Promise<PaginatedResponse<DesignationMaster>> => {
    const response = await api.get<PaginatedResponse<DesignationMaster>>('/api/v1/designation-master/list', { params });
    return response.data;
  },

  /**
   * Get all designation masters for export (uses provided page_size for export limit)
   * GET /api/v1/designation-master/list
   */
  getAllForExport: async (params?: Omit<DesignationMasterQueryParams, 'page' | 'page_size'>, page_size: number = 1000): Promise<DesignationMaster[]> => {
    const response = await api.get<PaginatedResponse<DesignationMaster>>('/api/v1/designation-master/list', {
      params: { ...params, page_size }
    });
    return response.data.data || [];
  },

  /**
   * Get designation master by ID
   * GET /api/v1/designation-master/{id}
   */
  getById: async (id: string): Promise<DesignationMaster> => {
    const response = await api.get<ApiResponse<DesignationMaster>>(`/api/v1/designation-master/${id}`);
    return response.data.data;
  },

  /**
   * Create new designation master
   * POST /api/v1/designation-master/create
   */
  create: async (data: DesignationMasterCreateRequest): Promise<DesignationMaster> => {
    const response = await api.post<ApiResponse<DesignationMaster>>('/api/v1/designation-master/create', data);
    return response.data.data;
  },

  /**
   * Update designation master
   * PATCH /api/v1/designation-master/update/{id}
   */
  update: async (id: string, data: DesignationMasterUpdateRequest): Promise<DesignationMaster> => {
    const response = await api.patch<ApiResponse<DesignationMaster>>(`/api/v1/designation-master/update/${id}`, data);
    return response.data.data;
  },

  /**
   * Delete designation master (soft delete)
   * DELETE /api/v1/designation-master/delete/{id}
   */
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/designation-master/delete/${id}`);
  },

  /**
   * Restore soft-deleted designation master
   * PATCH /api/v1/designation-master/restore/{id}
   */
  restore: async (id: string): Promise<DesignationMaster> => {
    const response = await api.patch<ApiResponse<DesignationMaster>>(`/api/v1/designation-master/restore/${id}`);
    return response.data.data;
  },

  /**
   * Toggle active status
   * PATCH /api/v1/designation-master/active/{id}
   */
  toggleActive: async (id: string, isActive: boolean): Promise<DesignationMaster> => {
    const response = await api.patch<ApiResponse<DesignationMaster>>(`/api/v1/designation-master/active/${id}`, { isActive });
    return response.data.data;
  },

  /**
   * Activate designation master
   */
  activate: async (id: string): Promise<DesignationMaster> => {
    return designationMasterService.toggleActive(id, true);
  },

  /**
   * Deactivate designation master
   */
  deactivate: async (id: string): Promise<DesignationMaster> => {
    return designationMasterService.toggleActive(id, false);
  },

  /**
   * Export designation masters as Excel file
   * GET /api/v1/designation-master/export
   */
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/designation-master/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};
