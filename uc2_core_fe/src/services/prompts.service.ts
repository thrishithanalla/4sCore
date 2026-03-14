import { api } from './api';
import type {
  Prompt,
  PromptCreateRequest,
  PromptUpdateRequest,
  PromptSearchParams,
  PromptListParams,
  PaginatedPromptResponse,
} from '../types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export const promptsService = {
  // List all prompts with pagination (no filters)
  list: async (params?: PromptListParams): Promise<PaginatedPromptResponse> => {
    const response = await api.get<PaginatedPromptResponse>('/api/v1/prompts/list', { params });
    return response.data;
  },

  // Search prompts with filters
  search: async (params?: PromptSearchParams): Promise<PaginatedPromptResponse> => {
    const response = await api.get<PaginatedPromptResponse>('/api/v1/prompts/search', { params });
    return response.data;
  },

  // Get prompt by ID
  getById: async (promptId: string): Promise<Prompt> => {
    const response = await api.get<ApiResponse<Prompt>>(`/api/v1/prompts/get/${promptId}`);
    return response.data.data;
  },

  // Create new prompt
  create: async (data: PromptCreateRequest): Promise<Prompt> => {
    const response = await api.post<ApiResponse<Prompt>>('/api/v1/prompts/create', data);
    return response.data.data;
  },

  // Update prompt
  update: async (promptId: string, data: PromptUpdateRequest): Promise<Prompt> => {
    const response = await api.put<ApiResponse<Prompt>>(`/api/v1/prompts/update/${promptId}`, data);
    return response.data.data;
  },

  // Soft delete prompt
  softDelete: async (promptId: string): Promise<{ message: string }> => {
    const response = await api.delete<ApiResponse<{ message: string }>>(`/api/v1/prompts/delete/${promptId}`);
    return response.data.data;
  },

  // Hard delete prompt (permanent)
  hardDelete: async (promptId: string): Promise<{ message: string }> => {
    const response = await api.delete<ApiResponse<{ message: string }>>(`/api/v1/prompts/hard-delete/${promptId}`);
    return response.data.data;
  },

  // Export prompts as Excel file
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/prompts/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};