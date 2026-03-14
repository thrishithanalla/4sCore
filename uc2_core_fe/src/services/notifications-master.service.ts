import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type {
  DeleteResponse,
  NotificationMaster,
  NotificationMasterCreateRequest,
  NotificationMasterQueryParams,
  NotificationMasterUpdateRequest,
} from '../types';

// Separate API instance for notifications service
// Based on Notification_API_DOCUMENTATION.md: https://devapi.ai4andhrapolice.com/core-notifications/
const NOTIFICATIONS_API_BASE_URL = import.meta.env.VITE_NOTIFICATIONS_API_BASE_URL || 'https://devapi.ai4andhrapolice.com/core-notifications/api/v1';

const notificationsApi: AxiosInstance = axios.create({
  baseURL: NOTIFICATIONS_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
notificationsApi.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
notificationsApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      const token = localStorage.getItem('accessToken');

      if (token && !currentPath.includes('/core/login')) {
        localStorage.removeItem('accessToken');
        window.location.href = '/core/login';
      }
    }
    return Promise.reject(error);
  }
);

// API prefix for notification masters (templates)
const BASE = '/notification-masters';

// Response wrapper type from API
interface ApiResponse<T> {
  data: T;
  total?: number;
  page?: number;
  page_size?: number;
  total_pages?: number;
}

export const notificationsService = {
  /**
   * List all notification masters (templates)
   * GET /api/v1/notification-masters/list
   *
   * Query params:
   * - search: Search in name, type, description
   * - category: Filter by category (TRANSACTIONAL, PROMOTIONAL, SYSTEM, ALERT)
   * - active: Filter by active status
   * - page: Page number (default 1)
   * - pageSize: Items per page (1-100, default 20)
   */
  getAll: async (params?: NotificationMasterQueryParams): Promise<NotificationMaster[]> => {
    const queryParams: Record<string, unknown> = {};

    // Support both new 'search' and legacy 'q' param
    if (params?.search) queryParams.search = params.search;
    else if (params?.q) queryParams.search = params.q;

    // Category filter
    if (params?.category) queryParams.category = params.category;

    // Active status filter
    if (params?.active !== undefined) queryParams.active = params.active;

    // Pagination - support both new 'pageSize' and legacy 'limit'
    if (params?.page) queryParams.page = params.page;
    if (params?.pageSize) queryParams.pageSize = params.pageSize;
    else if (params?.limit) queryParams.pageSize = params.limit;

    const res = await notificationsApi.get<ApiResponse<NotificationMaster[]> | NotificationMaster[]>(`${BASE}/list`, { params: queryParams });

    // Handle both wrapped and unwrapped response formats
    if (Array.isArray(res.data)) {
      return res.data;
    }
    return (res.data as ApiResponse<NotificationMaster[]>).data || [];
  },

  /**
   * Get notification master by ID
   * GET /api/v1/notification-masters/{master_id}
   */
  getById: async (id: string): Promise<NotificationMaster> => {
    const res = await notificationsApi.get<NotificationMaster | ApiResponse<NotificationMaster>>(`${BASE}/${id}`);

    // Handle both wrapped and unwrapped response formats
    if ((res.data as ApiResponse<NotificationMaster>).data) {
      return (res.data as ApiResponse<NotificationMaster>).data;
    }
    return res.data as NotificationMaster;
  },

  /**
   * Create notification master
   * POST /api/v1/notification-masters/create
   */
  create: async (payload: NotificationMasterCreateRequest): Promise<NotificationMaster> => {
    const res = await notificationsApi.post<NotificationMaster | ApiResponse<NotificationMaster>>(`${BASE}/create`, payload);

    // Handle both wrapped and unwrapped response formats
    if ((res.data as ApiResponse<NotificationMaster>).data) {
      return (res.data as ApiResponse<NotificationMaster>).data;
    }
    return res.data as NotificationMaster;
  },

  /**
   * Update notification master
   * PUT /api/v1/notification-masters/update/{master_id}
   */
  update: async (id: string, patch: NotificationMasterUpdateRequest): Promise<NotificationMaster> => {
    const res = await notificationsApi.put<NotificationMaster | ApiResponse<NotificationMaster>>(`${BASE}/update/${id}`, patch);

    // Handle both wrapped and unwrapped response formats
    if ((res.data as ApiResponse<NotificationMaster>).data) {
      return (res.data as ApiResponse<NotificationMaster>).data;
    }
    return res.data as NotificationMaster;
  },

  /**
   * Delete notification master (soft delete)
   * DELETE /api/v1/notification-masters/delete/{master_id}
   */
  delete: async (id: string): Promise<DeleteResponse> => {
    const res = await notificationsApi.delete<DeleteResponse>(`${BASE}/delete/${id}`);
    return res.data;
  },
};
