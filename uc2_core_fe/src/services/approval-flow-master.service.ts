import { api } from './api';
import type { PaginatedResponse } from '../types';

// Types
export interface FurtherProcess {
  requestType: string[];
  targetRole: string;
  targetUserId: string;
}

export interface NestedModule {
  _id: string;
  name?: string;
}

export interface NestedUnit {
  _id: string;
  name?: string;
  policeReferenceId?: string;
}

export interface NestedDistrict {
  _id: string;
  name?: string;
}

export interface ApprovalFlowMaster {
  _id: string;
  moduleId: string;
  flowName: string;
  description?: string;
  finalApprovalUnitId: string;
  finalApprovalPostCode: string;
  districtId?: string;
  furtherProcess?: FurtherProcess[];
  isActive: boolean;
  ifRejected: string;
  isDelete: boolean;
  createdBy?: string;
  createdAt?: string;
  createdIp?: string;
  updatedBy?: string;
  updatedAt?: string;
  updatedIp?: string;
  // Populated nested objects
  module?: NestedModule;
  finalApprovalUnit?: NestedUnit;
  district?: NestedDistrict;
}

export interface ApprovalFlowMasterCreateRequest {
  moduleId: string;
  flowName: string;
  description?: string;
  finalApprovalUnitId: string;
  finalApprovalPostCode: string;
  districtId?: string;
  furtherProcess?: FurtherProcess[];
  isActive?: boolean;
  ifRejected: string;
}

export interface ApprovalFlowMasterUpdateRequest {
  moduleId?: string;
  flowName?: string;
  description?: string;
  finalApprovalUnitId?: string;
  finalApprovalPostCode?: string;
  districtId?: string;
  furtherProcess?: FurtherProcess[];
  isActive?: boolean;
  ifRejected?: string;
}

export interface ApprovalFlowMasterQueryParams {
  isActive?: boolean;
  moduleId?: string;
  finalApprovalUnitId?: string;
  include_deleted?: boolean;
  search?: string;
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

export const approvalFlowMasterService = {
  /**
   * Get all approval flow masters with optional filters
   * GET /api/v1/approval-flow-master/list
   */
  getAll: async (params?: ApprovalFlowMasterQueryParams): Promise<PaginatedResponse<ApprovalFlowMaster>> => {
    const response = await api.get<PaginatedResponse<ApprovalFlowMaster>>('/api/v1/approval-flow-master/list', { params });
    return response.data;
  },

  /**
   * Get all approval flow masters for dropdown (no pagination, fetches all records)
   */
  getAllForDropdown: async (moduleId?: string): Promise<ApprovalFlowMaster[]> => {
    const response = await api.get<PaginatedResponse<ApprovalFlowMaster>>('/api/v1/approval-flow-master/list', {
      params: {  include_deleted: false, ...(moduleId && { moduleId }) }
    });
    return response.data.data || [];
  },

  /**
   * Get approval flow master by ID
   * GET /api/v1/approval-flow-master/get/{id}
   */
  getById: async (id: string): Promise<ApprovalFlowMaster> => {
    const response = await api.get<ApiResponse<ApprovalFlowMaster>>(`/api/v1/approval-flow-master/get/${id}`);
    return response.data.data;
  },

  /**
   * Get approval flow masters by module ID
   * GET /api/v1/approval-flow-master/get/by-module/{moduleId}
   */
  getByModule: async (moduleId: string, params?: { include_deleted?: boolean }): Promise<ApprovalFlowMaster[]> => {
    const response = await api.get<ApiResponse<ApprovalFlowMaster[]>>(`/api/v1/approval-flow-master/get/by-module/${moduleId}`, { params });
    return response.data.data || [];
  },

  /**
   * Create new approval flow master
   * POST /api/v1/approval-flow-master/create
   */
  create: async (data: ApprovalFlowMasterCreateRequest): Promise<ApprovalFlowMaster> => {
    const response = await api.post<ApiResponse<ApprovalFlowMaster>>('/api/v1/approval-flow-master/create', data);
    return response.data.data;
  },

  /**
   * Update approval flow master
   * PATCH /api/v1/approval-flow-master/update/{id}
   */
  update: async (id: string, data: ApprovalFlowMasterUpdateRequest): Promise<ApprovalFlowMaster> => {
    const response = await api.patch<ApiResponse<ApprovalFlowMaster>>(`/api/v1/approval-flow-master/update/${id}`, data);
    return response.data.data;
  },

  /**
   * Delete approval flow master (soft delete)
   * DELETE /api/v1/approval-flow-master/delete/{id}
   */
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/approval-flow-master/delete/${id}`);
  },

  /**
   * Restore soft-deleted approval flow master
   * PATCH /api/v1/approval-flow-master/restore/{id}
   */
  restore: async (id: string): Promise<ApprovalFlowMaster> => {
    const response = await api.patch<ApiResponse<ApprovalFlowMaster>>(`/api/v1/approval-flow-master/restore/${id}`);
    return response.data.data;
  },

  /**
   * Export approval flow masters as Excel file
   * GET /api/v1/approval-flow-master/export
   */
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/approval-flow-master/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};
