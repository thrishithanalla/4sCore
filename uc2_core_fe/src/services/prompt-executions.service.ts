/**
 * Prompt Executions Service
 * API service for AI Prompts monitoring and execution tracking
 */

import { api } from './api';
import type {
  PromptExecution,
  PromptExecutionListResponse,
  PromptExecutionListParams,
  PromptExecutionDashboardResponse,
  PromptExecutionDashboardParams,
  PromptExecutionRecentCall,
  PromptExecutionRecentCallsParams,
  PromptExecutionCreateRequest,
  ApiResponse,
} from '../types/prompt-execution.types';

const BASE_PATH = '/api/v1/prompt-executions';

export const promptExecutionsService = {
  /**
   * Get dashboard statistics
   */
  getDashboard: async (params?: PromptExecutionDashboardParams): Promise<PromptExecutionDashboardResponse> => {
    const response = await api.get<ApiResponse<PromptExecutionDashboardResponse>>(`${BASE_PATH}/dashboard`, { params });
    return response.data.data;
  },

  /**
   * Get recent calls with pagination
   */
  getRecentCalls: async (params?: PromptExecutionRecentCallsParams): Promise<{
    recentCalls: PromptExecutionRecentCall[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> => {
    const response = await api.get<ApiResponse<{
      recentCalls: PromptExecutionRecentCall[];
      totalCount: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>>(`${BASE_PATH}/recent-calls`, { params });
    return response.data.data;
  },

  /**
   * List prompt executions with filtering and pagination
   */
  list: async (params?: PromptExecutionListParams): Promise<PromptExecutionListResponse> => {
    const response = await api.get<ApiResponse<PromptExecutionListResponse>>(`${BASE_PATH}/list`, { params });
    return response.data.data;
  },

  /**
   * Get a single prompt execution by ID
   */
  getById: async (executionId: string): Promise<PromptExecution> => {
    const response = await api.get<ApiResponse<PromptExecution>>(`${BASE_PATH}/get/${executionId}`);
    return response.data.data;
  },

  /**
   * Create a new prompt execution record
   */
  create: async (data: PromptExecutionCreateRequest): Promise<PromptExecution> => {
    const response = await api.post<ApiResponse<PromptExecution>>(`${BASE_PATH}/create`, data);
    return response.data.data;
  },

  /**
   * Soft delete a prompt execution
   */
  delete: async (executionId: string): Promise<{ message: string }> => {
    const response = await api.delete<ApiResponse<{ message: string }>>(`${BASE_PATH}/delete/${executionId}`);
    return response.data.data;
  },

  /**
   * Restore a soft-deleted prompt execution
   */
  restore: async (executionId: string): Promise<PromptExecution> => {
    const response = await api.patch<ApiResponse<PromptExecution>>(`${BASE_PATH}/restore/${executionId}`);
    return response.data.data;
  },

  /**
   * Export prompt executions dashboard as Excel file
   */
  export: async (): Promise<Blob> => {
    const response = await api.get(`${BASE_PATH}/dashboard/export`, {
      responseType: 'blob',
    });
    return response.data;
  },
};

export default promptExecutionsService;
