import { api } from './api';
import type {
  ErrorMaster,
  ErrorMasterCreateRequest,
  ErrorMasterUpdateRequest,
  ErrorMasterSearchParams,
  ErrorMasterSearchResponse,
} from '../types';

export const errorMasterService = {
  // Get all error masters with pagination and filters
  getAll: async (params?: ErrorMasterSearchParams): Promise<ErrorMasterSearchResponse> => {
    const response = await api.get<ErrorMasterSearchResponse>('/api/v1/error-master/list', { params });
    return response.data;
  },

  // Get error master by ID
  getById: async (id: string): Promise<ErrorMaster> => {
    const response = await api.get<{ data: ErrorMaster }>(`/api/v1/error-master/get/${id}`);
    return response.data.data;
  },

  // Get error master by error code
  getByCode: async (errorCode: string): Promise<ErrorMaster> => {
    const response = await api.get<ErrorMaster>(`/api/v1/error-master/by-code/${errorCode}`);
    return response.data;
  },

  // Create new error master
  create: async (data: ErrorMasterCreateRequest): Promise<ErrorMaster> => {
    const response = await api.post<ErrorMaster>('/api/v1/error-master/create', data);
    return response.data;
  },

  // Update error master
  update: async (id: string, data: ErrorMasterUpdateRequest): Promise<ErrorMaster> => {
    const response = await api.patch<ErrorMaster>(`/api/v1/error-master/update/${id}`, data);
    return response.data;
  },

  // Delete error master
  delete: async (id: string, restrict: boolean = true): Promise<void> => {
    await api.delete(`/api/v1/error-master/delete/${id}`, {
      params: { restrict },
    });
  },

  // Export error masters as Excel file
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/error-master/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};