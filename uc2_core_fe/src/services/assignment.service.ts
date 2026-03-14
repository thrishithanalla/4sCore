import { api } from './api';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

// Assignment creation request
export interface AssignmentCreateRequest {
  userId: string;
  unitId: string;
  postCode: string;
  assignmentType?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
  additionalPermissions?: Array<{
    moduleId: string;
    jobId: string;
    permissions: string[];
  }>;
  exclusionPermissions?: Array<{
    moduleId: string;
    jobId: string;
    permissions: string[];
  }>;
}

// Assignment update request
export interface AssignmentUpdateRequest {
  assignmentType?: string;
  isActive?: boolean;
  endDate?: string;
  additionalPermissions?: Array<{
    moduleId: string;
    jobId: string;
    permissions: string[];
  }>;
  exclusionPermissions?: Array<{
    moduleId: string;
    jobId: string;
    permissions: string[];
  }>;
}

// Populated user info (returned from list API)
export interface PopulatedUserInfo {
  _id?: string;
  name?: string;
  userId?: string;
}

// Populated unit info (returned from list API)
export interface PopulatedUnitInfo {
  _id?: string;
  name?: string;
}

// Populated role info (from embedded post's assignedRoles)
export interface PopulatedRoleInfo {
  _id: string;
  roleName: string;
  roleShortCode?: string;
}

// Populated post info (returned from list API with full embedded post data)
export interface PopulatedPostInfo {
  postCode?: string;
  postName?: string;
  isUnitHead?: boolean;
  assignedRoles?: PopulatedRoleInfo[];
  description?: string;
  isActive?: boolean;
}

// Assignment response
export interface Assignment {
  _id: string;
  userId: string;
  unitId: string;
  postCode: string;
  assignmentType?: string;
  isActive: boolean;
  isPrimary?: boolean;
  startDate?: string;
  endDate?: string;
  additionalPermissions?: Array<{
    moduleId: string;
    jobId: string;
    permissions: string[];
  }>;
  exclusionPermissions?: Array<{
    moduleId: string;
    jobId: string;
    permissions: string[];
  }>;
  isDelete: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  // Populated fields (returned from list API with aggregation)
  user?: PopulatedUserInfo;
  unit?: PopulatedUnitInfo;
  post?: PopulatedPostInfo;
}

// Paginated response
interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Query parameters for listing assignments
export interface AssignmentQueryParams {
  userId?: string;
  unitId?: string;
  postCode?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  isDelete?: boolean;
  page?: number;
  pageSize?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const assignmentService = {
  /**
   * Create a new assignment
   * This also cascades to update the unit post's assignedUser field
   */
  create: async (data: AssignmentCreateRequest): Promise<Assignment> => {
    const response = await api.post<ApiResponse<Assignment>>('/api/v1/assignments', data);
    return response.data.data;
  },

  /**
   * Get assignment by ID
   */
  getById: async (id: string): Promise<Assignment> => {
    const response = await api.get<ApiResponse<Assignment>>(`/api/v1/assignments/${id}`);
    return response.data.data;
  },

  /**
   * List assignments with filters
   */
  list: async (params?: AssignmentQueryParams): Promise<PaginatedResponse<Assignment>> => {
    const response = await api.get<ApiResponse<PaginatedResponse<Assignment>>>('/api/v1/assignments', { params });
    return response.data.data;
  },

  /**
   * Update assignment
   */
  update: async (id: string, data: AssignmentUpdateRequest): Promise<Assignment> => {
    const response = await api.patch<ApiResponse<Assignment>>(`/api/v1/assignments/${id}`, data);
    return response.data.data;
  },

  /**
   * Delete (soft delete) assignment
   * This also cascades to clear the unit post's assignedUser field
   */
  delete: async (id: string, endDate?: string): Promise<{ message: string }> => {
    const response = await api.delete<ApiResponse<{ message: string }>>(`/api/v1/assignments/${id}`, {
      data: { endDate },
    });
    return response.data.data;
  },

  /**
   * Get all assignments for a user
   */
  getUserAssignments: async (userId: string, isActive?: boolean): Promise<Assignment[]> => {
    const response = await api.get<ApiResponse<Assignment[]>>(`/api/v1/users/${userId}/assignments`, {
      params: { isActive },
    });
    return response.data.data;
  },

  /**
   * Get all users assigned to a post
   */
  getPostUsers: async (unitId: string, postCode: string): Promise<Assignment[]> => {
    const response = await api.get<ApiResponse<Assignment[]>>(`/api/v1/units/${unitId}/posts/${postCode}/users`);
    return response.data.data;
  },

  /**
   * Set assignment as user's primary post
   */
  setPrimary: async (id: string): Promise<Assignment> => {
    const response = await api.patch<ApiResponse<Assignment>>(`/api/v1/assignments/${id}/set-primary`);
    return response.data.data;
  },

  /**
   * Bulk create multiple assignments
   */
  bulkCreate: async (assignments: AssignmentCreateRequest[]): Promise<string[]> => {
    const response = await api.post<ApiResponse<string[]>>('/api/v1/assignments/bulk', assignments);
    return response.data.data;
  },

  /**
   * Get all assignments for export (uses provided page_size for export limit)
   */
  getAllForExport: async (params?: Omit<AssignmentQueryParams, 'page' | 'pageSize'>, pageSize: number = 1000): Promise<Assignment[]> => {
    const response = await api.get<ApiResponse<PaginatedResponse<Assignment>>>('/api/v1/assignments', {
      params: { ...params, pageSize },
    });
    return response.data.data.data || [];
  },

  /**
   * Export assignments as Excel blob
   * GET /api/v1/assignments/export
   */
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/assignments/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};
