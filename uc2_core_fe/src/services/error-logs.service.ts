import { api } from './api';
import type {
  ErrorLog,
  ErrorLogCreateRequest,
  ErrorLogSearchParams,
  ErrorLogSearchResponse,
  ErrorLogDashboardResponse,
} from '../types';

export const errorLogsService = {
  // Search error logs with filters
  search: async (params?: ErrorLogSearchParams): Promise<ErrorLogSearchResponse> => {
    const response = await api.get<ErrorLogSearchResponse>('/api/v1/error-logs/list', { params });
    return response.data;
  },

  // Create a new error log
  create: async (data: ErrorLogCreateRequest): Promise<ErrorLog> => {
    const response = await api.post<ErrorLog>('/api/v1/error-logs', data);
    return response.data;
  },

  // Export error logs as CSV
  exportCSV: async (params?: ErrorLogSearchParams): Promise<Blob> => {
    const response = await api.get('/api/v1/error-logs/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  // Get dashboard data
  getDashboardData: async (params?: {
    timeRange?: string;
    sourceType?: string;
    errorSeverity?: string;
    moduleId?: string;
    errorCode?: string;
    includeArchive?: boolean;
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }): Promise<ErrorLogDashboardResponse> => {
    const response = await api.post<ErrorLogDashboardResponse>('/api/v1/error-logs/dashboard', params || {});
    return response.data;
  },
};