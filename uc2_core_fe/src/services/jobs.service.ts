import { api } from './api';
import type { Job, JobCreateRequest, JobUpdateRequest, DeleteResponse, PaginatedResponse } from '../types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export interface JobQueryParams {
  page?: number;
  page_size?: number;
  search?: string;
  include_deleted?: boolean;
}

export const jobsService = {
  // Get all jobs with pagination
  getAll: async (params?: JobQueryParams): Promise<PaginatedResponse<Job>> => {
    const response = await api.get<PaginatedResponse<Job>>('/api/v1/jobs/list', { params });
    return response.data;
  },

  /**
   * Get all jobs for dropdown (no pagination, fetches all records)
   */
  getAllForDropdown: async (): Promise<Job[]> => {
    const response = await api.get<PaginatedResponse<Job>>('/api/v1/jobs/list', {
      params: {  include_deleted: false }
    });
    return response.data.data || [];
  },

  // Get job by ID
  getById: async (id: string): Promise<Job> => {
    const response = await api.get<ApiResponse<Job>>(`/api/v1/jobs/get/${id}`);
    return response.data.data;
  },

  // Create new job
  create: async (payload: JobCreateRequest): Promise<Job> => {
    const response = await api.post<ApiResponse<Job>>('/api/v1/jobs/create', payload);
    return response.data.data;
  },

  // Bulk create jobs
  bulkCreate: async (payload: JobCreateRequest[]): Promise<Job[]> => {
    const response = await api.post<ApiResponse<Job[]>>('/api/v1/jobs/bulk-create', payload);
    return response.data.data;
  },

  // Update job (PATCH for partial updates)
  update: async (id: string, payload: JobUpdateRequest): Promise<Job> => {
    const response = await api.patch<ApiResponse<Job>>(`/api/v1/jobs/update/${id}`, payload);
    return response.data.data;
  },

  // Delete job (soft delete)
  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<ApiResponse<DeleteResponse>>(`/api/v1/jobs/delete/${id}`);
    return response.data.data;
  },

  // Restore deleted job
  restore: async (id: string): Promise<Job> => {
    const response = await api.patch<ApiResponse<Job>>(`/api/v1/jobs/restore/${id}`);
    return response.data.data;
  },

  // Toggle active status
  toggleActive: async (id: string, isActive: boolean): Promise<Job> => {
    const response = await api.patch<ApiResponse<Job>>(`/api/v1/jobs/active/${id}`, { isActive });
    return response.data.data;
  },

  // Get all jobs for export (fetches all records without pagination limit)
  getAllForExport: async (params?: Omit<JobQueryParams, 'page' | 'page_size'>): Promise<Job[]> => {
    const response = await api.get<PaginatedResponse<Job>>('/api/v1/jobs/list', {
      params: { ...params, page_size: 1000 },
    });
    return response.data.data || [];
  },
};
