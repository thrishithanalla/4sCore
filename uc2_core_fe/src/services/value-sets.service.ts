import { api } from './api';
import type {
  ValueSet,
  ValueSetLocalized,
  ValueSetCreateRequest,
  DeleteResponse,
  PaginatedResponse,
  ValueSetBootstrapResponse,
  ValueSetItemLocalized,
  ValidateEnumRequest,
  ValidateEnumResponse,
  GetLabelResponse,
  CacheRefreshResponse,
  PreloadResponse
} from '../types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export interface ValueSetQueryParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: 'active' | 'archived';
  module?: string;
  moduleId?: string;
  lang?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const valueSetsService = {
  // Get all value sets with pagination and filters
  getAll: async (params?: ValueSetQueryParams): Promise<PaginatedResponse<ValueSet>> => {
    const response = await api.get<PaginatedResponse<ValueSet>>('/api/v1/value-sets/list', { params });
    return response.data;
  },

  // Get all value sets for export (uses provided page_size for export limit)
  getAllForExport: async (params?: Omit<ValueSetQueryParams, 'page' | 'page_size'>, page_size: number = 1000): Promise<ValueSet[]> => {
    const response = await api.get<PaginatedResponse<ValueSet>>('/api/v1/value-sets/list', {
      params: { ...params, page_size }
    });
    return response.data.data || [];
  },

  // Get value set by ID (for backwards compatibility)
  getById: async (id: string): Promise<ValueSet> => {
    const response = await api.get<ApiResponse<ValueSet>>(`/api/v1/value-sets/get/${id}`);
    return response.data.data;
  },

  // Get value set by key with optional language parameter (returns localized)
  getByKey: async (key: string, lang: string = 'en'): Promise<ValueSetLocalized> => {
    const response = await api.get<ApiResponse<ValueSetLocalized>>(`/api/v1/value-sets/get/${key}`, {
      params: { lang }
    });
    return response.data.data;
  },

  // Get value set by key with full labels (for editing) - no lang param
  getByKeyFull: async (key: string): Promise<ValueSet> => {
    const response = await api.get<ApiResponse<ValueSet>>(`/api/v1/value-sets/get/${key}`);
    return response.data.data;
  },

  // Create new value set
  create: async (data: ValueSetCreateRequest): Promise<ValueSet> => {
    const response = await api.post<ApiResponse<ValueSet>>('/api/v1/value-sets/create', data);
    return response.data.data;
  },

  // Update value set by key
  update: async (key: string, data: Partial<ValueSetCreateRequest>): Promise<ValueSet> => {
    const response = await api.put<ApiResponse<ValueSet>>(`/api/v1/value-sets/update/${key}`, data);
    return response.data.data;
  },

  // Archive value set (soft delete) by key
  delete: async (key: string): Promise<DeleteResponse> => {
    const response = await api.delete<ApiResponse<DeleteResponse>>(`/api/v1/value-sets/delete/${key}`);
    return response.data.data;
  },

  // Archive value set by key
  archive: async (key: string): Promise<{ message: string }> => {
    const response = await api.delete<ApiResponse<{ message: string }>>(`/api/v1/value-sets/${key}`);
    return response.data.data;
  },

  // Activate archived value set by key
  activate: async (key: string): Promise<{ message: string }> => {
    const response = await api.patch<ApiResponse<{ message: string }>>(`/api/v1/value-sets/${key}/activate`);
    return response.data.data;
  },

  // Bootstrap all active value sets with localized labels
  bootstrap: async (lang: string = 'en'): Promise<ValueSetBootstrapResponse> => {
    const response = await api.get<ApiResponse<ValueSetBootstrapResponse>>('/api/v1/value-sets/bootstrap', {
      params: { lang }
    });
    return response.data.data;
  },

  // Get all items for a specific value set with localized labels
  getItems: async (key: string, lang: string = 'en'): Promise<ValueSetItemLocalized[]> => {
    const response = await api.get<ApiResponse<ValueSetItemLocalized[]>>(`/api/v1/value-sets/get/${key}/items`, {
      params: { lang }
    });
    return response.data.data;
  },

  // Validate if a code exists in a value set
  validate: async (data: ValidateEnumRequest): Promise<ValidateEnumResponse> => {
    const response = await api.post<ApiResponse<ValidateEnumResponse>>('/api/v1/value-sets/validate', data);
    return response.data.data;
  },

  // Get localized label for a specific code
  getLabel: async (key: string, code: string, lang: string = 'en'): Promise<GetLabelResponse> => {
    const response = await api.get<ApiResponse<GetLabelResponse>>(`/api/v1/value-sets/${key}/label/${code}`, {
      params: { lang }
    });
    return response.data.data;
  },

  // Refresh cache for all value sets
  refreshAllCache: async (): Promise<CacheRefreshResponse> => {
    const response = await api.post<ApiResponse<CacheRefreshResponse>>('/api/v1/value-sets/cache/refresh');
    return response.data.data;
  },

  // Refresh cache for a specific value set
  refreshCache: async (key: string): Promise<CacheRefreshResponse> => {
    const response = await api.post<ApiResponse<CacheRefreshResponse>>(`/api/v1/value-sets/${key}/cache/refresh`);
    return response.data.data;
  },

  // Preload specific value sets into cache
  preload: async (keys: string[]): Promise<PreloadResponse> => {
    const response = await api.post<ApiResponse<PreloadResponse>>('/api/v1/value-sets/preload', { keys });
    return response.data.data;
  },

  // Export value sets as Excel file
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/value-sets/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};