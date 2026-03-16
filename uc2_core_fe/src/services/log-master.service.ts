import { auditlogApi } from './auditlog-api';
import type { LogMaster, LogMasterCreateRequest, LogMasterUpdateRequest, LogMasterQueryParams, DeleteResponse } from '../types';

// API prefix for log master endpoints
const BASE = '/api/v1/log-master';

// Response wrapper from API
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

// Paginated response structure
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export const logMasterService = {
  /**
   * Get all log masters with filters
   * GET /api/v1/log-master/list
   */
  getAll: async (params?: LogMasterQueryParams): Promise<LogMaster[]> => {
    const queryParams: Record<string, unknown> = {};

    if (params?.eventCode) queryParams.eventCode = params.eventCode;
    if (params?.layer) queryParams.layer = params.layer;
    if (params?.action) queryParams.action = params.action;
    if (params?.logObject) queryParams.logObject = params.logObject;
    if (params?.logtype) queryParams.logtype = params.logtype;
    if (params?.include_deleted !== undefined) {
      queryParams.include_deleted = params.include_deleted;
    } else {
      queryParams.include_deleted = false;
    }
    if (params?.page) queryParams.page = params.page;
    if (params?.page_size) queryParams.page_size = params.page_size;

    const response = await auditlogApi.get<ApiResponse<PaginatedResponse<LogMaster>>>(`${BASE}/list`, { params: queryParams });
    return response.data.data?.items || [];
  },

  /**
   * Get all log masters with pagination info
   */
  getAllPaginated: async (params?: LogMasterQueryParams): Promise<PaginatedResponse<LogMaster>> => {
    const queryParams: Record<string, unknown> = {};

    if (params?.eventCode) queryParams.eventCode = params.eventCode;
    if (params?.layer) queryParams.layer = params.layer;
    if (params?.action) queryParams.action = params.action;
    if (params?.logObject) queryParams.logObject = params.logObject;
    if (params?.logtype) queryParams.logtype = params.logtype;
    if (params?.include_deleted !== undefined) {
      queryParams.include_deleted = params.include_deleted;
    } else {
      queryParams.include_deleted = false;
    }
    if (params?.page) queryParams.page = params.page;
    if (params?.page_size) queryParams.page_size = params.page_size;

    const response = await auditlogApi.get<ApiResponse<PaginatedResponse<LogMaster>>>(`${BASE}/list`, { params: queryParams });
    return response.data.data || { items: [], total: 0, page: 1, page_size: 10, total_pages: 0 };
  },

  /**
   * Get all log masters for export
   */
  getAllForExport: async (params?: Omit<LogMasterQueryParams, 'page' | 'page_size'>, page_size: number = 1000): Promise<LogMaster[]> => {
    const queryParams: Record<string, unknown> = {
      page_size,
      include_deleted: false,
    };

    if (params?.eventCode) queryParams.eventCode = params.eventCode;
    if (params?.layer) queryParams.layer = params.layer;
    if (params?.logtype) queryParams.logtype = params.logtype;
    if (params?.include_deleted !== undefined) queryParams.include_deleted = params.include_deleted;

    const response = await auditlogApi.get<ApiResponse<PaginatedResponse<LogMaster>>>(`${BASE}/list`, { params: queryParams });
    return response.data.data?.items || [];
  },

  /**
   * Get log master by ID
   * GET /api/v1/log-master/get?id={id}
   */
  getById: async (id: string): Promise<LogMaster> => {
    const response = await auditlogApi.get<ApiResponse<LogMaster>>(`${BASE}/get`, { params: { id } });
    return response.data.data;
  },

  /**
   * Create new log master
   * POST /api/v1/log-master/create
   */
  create: async (payload: LogMasterCreateRequest): Promise<LogMaster> => {
    const response = await auditlogApi.post<ApiResponse<LogMaster>>(`${BASE}/create`, payload);
    return response.data.data;
  },

  /**
   * Update log master
   * PUT /api/v1/log-master/update?id={id}
   */
  update: async (id: string, payload: LogMasterUpdateRequest): Promise<LogMaster> => {
    const response = await auditlogApi.put<ApiResponse<LogMaster>>(`${BASE}/update`, payload, { params: { id } });
    return response.data.data;
  },

  /**
   * Delete log master (soft delete)
   * DELETE /api/v1/log-master/delete?id={id}
   */
  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await auditlogApi.delete<DeleteResponse>(`${BASE}/delete`, { params: { id } });
    return response.data;
  },

  /**
   * Bulk create log masters
   * POST /api/v1/log-master/bulk-create
   */
  bulkCreate: async (items: LogMasterCreateRequest[]): Promise<{
    success: LogMaster[];
    failed: Array<{ index: number; eventCode: string; error: string }>;
    totalSuccess: number;
    totalFailed: number;
  }> => {
    const response = await auditlogApi.post<ApiResponse<{
      success: LogMaster[];
      failed: Array<{ index: number; eventCode: string; error: string }>;
      totalSuccess: number;
      totalFailed: number;
    }>>(`${BASE}/bulk-create`, { items });
    return response.data.data;
  },
};
