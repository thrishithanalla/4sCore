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
   *
   * Query params:
   * - page: Page number (optional, if not provided returns all)
   * - page_size: Items per page (optional)
   * - moduleId: Filter by module ID
   * - name: Search by name (partial match)
   * - include_deleted: Include soft-deleted records (default: false)
   */
  getAll: async (params?: LogMasterQueryParams): Promise<LogMaster[]> => {
    const queryParams: Record<string, unknown> = {};

    if (params?.moduleId) {
      queryParams.moduleId = params.moduleId;
    }
    if (params?.name) {
      queryParams.name = params.name;
    }
    if (params?.include_deleted !== undefined) {
      queryParams.include_deleted = params.include_deleted;
    } else {
      queryParams.include_deleted = false;
    }
    if (params?.page) {
      queryParams.page = params.page;
    }
    if (params?.limit) {
      queryParams.page_size = params.limit;
    }

    const response = await auditlogApi.get<ApiResponse<PaginatedResponse<LogMaster>>>(`${BASE}/list`, { params: queryParams });

    // API returns { success, code, message, data: { items, total, page, page_size, total_pages } }
    return response.data.data?.items || [];
  },

  /**
   * Get all log masters with pagination info
   * Returns full paginated response
   */
  getAllPaginated: async (params?: LogMasterQueryParams): Promise<PaginatedResponse<LogMaster>> => {
    const queryParams: Record<string, unknown> = {};

    if (params?.moduleId) {
      queryParams.moduleId = params.moduleId;
    }
    if (params?.name) {
      queryParams.name = params.name;
    }
    if (params?.include_deleted !== undefined) {
      queryParams.include_deleted = params.include_deleted;
    } else {
      queryParams.include_deleted = false;
    }
    if (params?.page) {
      queryParams.page = params.page;
    }
    if (params?.limit) {
      queryParams.page_size = params.limit;
    }

    const response = await auditlogApi.get<ApiResponse<PaginatedResponse<LogMaster>>>(`${BASE}/list`, { params: queryParams });

    return response.data.data || { items: [], total: 0, page: 1, page_size: 10, total_pages: 0 };
  },

  /**
   * Get all log masters for export (uses provided page_size for export limit)
   * GET /api/v1/log-master/list
   */
  getAllForExport: async (params?: Omit<LogMasterQueryParams, 'page' | 'limit'>, page_size: number = 1000): Promise<LogMaster[]> => {
    const queryParams: Record<string, unknown> = {
      page_size,
      include_deleted: false,
    };

    if (params?.moduleId) {
      queryParams.moduleId = params.moduleId;
    }
    if (params?.name) {
      queryParams.name = params.name;
    }
    if (params?.include_deleted !== undefined) {
      queryParams.include_deleted = params.include_deleted;
    }

    const response = await auditlogApi.get<ApiResponse<PaginatedResponse<LogMaster>>>(`${BASE}/list`, { params: queryParams });
    return response.data.data?.items || [];
  },

  /**
   * Get log master by ID
   * GET /api/v1/log-master/get?id={id}
   * Note: Uses query parameter, not path parameter
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
   * Note: Uses query parameter, not path parameter
   */
  update: async (id: string, payload: LogMasterUpdateRequest): Promise<LogMaster> => {
    const response = await auditlogApi.put<ApiResponse<LogMaster>>(`${BASE}/update`, payload, { params: { id } });
    return response.data.data;
  },

  /**
   * Delete log master (soft delete)
   * DELETE /api/v1/log-master/delete?id={id}
   * Note: Uses query parameter, not path parameter
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
    failed: Array<{ index: number; name: string; error: string }>;
    totalSuccess: number;
    totalFailed: number;
  }> => {
    const response = await auditlogApi.post<ApiResponse<{
      success: LogMaster[];
      failed: Array<{ index: number; name: string; error: string }>;
      totalSuccess: number;
      totalFailed: number;
    }>>(`${BASE}/bulk-create`, { items });
    return response.data.data;
  },
};
