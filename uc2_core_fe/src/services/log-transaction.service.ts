import axios from 'axios';
import type {
  LogTransactionSearchParams,
  LogTransactionSearchResponse,
  LogTransactionAnalyticsResponse,
  DashboardResponse,
  AuditDashboardFilters,
  UserOption,
  LogTemplate,
} from '../types/log-transaction.types';

// Create a separate axios instance for auditlog API
const auditlogApi = axios.create({
  baseURL: import.meta.env.VITE_AUDITLOG_API_BASE_URL || 'https://devapi.ai4andhrapolice.com/core-auditlog',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth interceptor to include token from localStorage
auditlogApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const logTransactionService = {
  // Search log transactions with filters
  search: async (params?: LogTransactionSearchParams): Promise<LogTransactionSearchResponse> => {
    const response = await auditlogApi.get<LogTransactionSearchResponse>('/api/v1/log-transactions/list', { params });
    return response.data;
  },

  // Get analytics for log level counts
  getAnalytics: async (params?: { fromDate?: string; toDate?: string }): Promise<LogTransactionAnalyticsResponse> => {
    const response = await auditlogApi.get<LogTransactionAnalyticsResponse>('/api/v1/log-transactions/analytics', { params });
    return response.data;
  },

  // Export log transactions as CSV
  exportCSV: async (params?: LogTransactionSearchParams): Promise<Blob> => {
    const response = await auditlogApi.get('/api/v1/log-transactions/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  // Get combined dashboard data
  getDashboard: async (params?: AuditDashboardFilters): Promise<DashboardResponse> => {
    const response = await auditlogApi.get<DashboardResponse>('/api/v1/log-transactions/dashboard', { params });
    return response.data;
  },

  // Get users for filter dropdown (searchable, max 20)
  getAllUsers: async (search?: string): Promise<{ success: boolean; data: UserOption[] }> => {
    const response = await auditlogApi.get('/api/v1/log-transactions/all-users', {
      params: { search },
    });
    return response.data;
  },

  // Get all log templates for filter dropdown
  getAllTemplates: async (): Promise<{ success: boolean; data: LogTemplate[] }> => {
    const response = await auditlogApi.get('/api/v1/log-transactions/all-templates');
    return response.data;
  },
};
