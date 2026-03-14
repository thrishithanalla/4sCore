import { api } from './api';
import type { PaginatedResponse } from '../types';

// Types
export type ComponentType = string;

export interface FeedbackMasterOptions {
  likedOptions?: string[];
  dislikedOptions?: string[];
}

export interface FeedbackMaster {
  _id: string;
  name: string;
  componentType: ComponentType;
  options?: FeedbackMasterOptions;
  moduleId?: string;
  module?: {
    _id: string;
    name: string;
  };
  isActive: boolean;
  isDelete: boolean;
  createdBy?: string;
  createdAt?: string;
  createdIp?: string;
  updatedBy?: string;
  updatedAt?: string;
  updatedIp?: string;
}

export interface FeedbackMasterCreateRequest {
  name: string;
  componentType: ComponentType;
  options?: FeedbackMasterOptions;
  moduleId?: string;
}

export interface FeedbackMasterUpdateRequest {
  name?: string;
  componentType?: ComponentType;
  options?: FeedbackMasterOptions;
  moduleId?: string;
}

export interface FeedbackMasterQueryParams {
  search?: string;
  include_deleted?: boolean;
  is_active?: boolean;
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

export const feedbackMasterService = {
  getAll: async (params?: FeedbackMasterQueryParams): Promise<PaginatedResponse<FeedbackMaster>> => {
    const response = await api.get<PaginatedResponse<FeedbackMaster>>('/api/v1/feedback-master/list', { params });
    return response.data;
  },

  getById: async (id: string): Promise<FeedbackMaster> => {
    const response = await api.get<ApiResponse<FeedbackMaster>>(`/api/v1/feedback-master/get/${id}`);
    return response.data.data;
  },

  create: async (data: FeedbackMasterCreateRequest): Promise<FeedbackMaster> => {
    const response = await api.post<ApiResponse<FeedbackMaster>>('/api/v1/feedback-master/create', data);
    return response.data.data;
  },

  update: async (id: string, data: FeedbackMasterUpdateRequest): Promise<FeedbackMaster> => {
    const response = await api.patch<ApiResponse<FeedbackMaster>>(`/api/v1/feedback-master/update/${id}`, data);
    return response.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/feedback-master/delete/${id}`);
  },

  restore: async (id: string): Promise<FeedbackMaster> => {
    const response = await api.patch<ApiResponse<FeedbackMaster>>(`/api/v1/feedback-master/restore/${id}`);
    return response.data.data;
  },

  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/feedback-master/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};

// Get modules for dropdown
export const getModulesForDropdown = async (): Promise<{ _id: string; name: string }[]> => {
  const response = await api.get<ApiResponse<{ _id: string; name: string }[]>>('/api/v1/modules/list?include_deleted=false');
  return response.data.data || [];
};
