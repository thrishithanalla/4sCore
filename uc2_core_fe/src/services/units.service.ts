import { api } from './api';
import type {
  Unit,
  UnitMinimal,
  UnitCreateRequest,
  DeleteResponse,
  PaginatedResponse,
  EmbeddedPostCreateRequest,
  EmbeddedPostUpdateRequest,
  PostAssignUserRequest,
  PostRolesRequest
} from '../types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export interface UnitQueryParams {
  include_deleted?: boolean;
  districtId?: string;  // Changed from district to districtId
  unitTypeId?: string;
  departmentId?: string;
  parentUnitId?: string;
  page?: number;
  page_size?: number;
  search?: string;  // Search by name, policeReferenceId, or city
  unitCode?: string;  // Search by unit code
  sort_by?: string;   // Column/field to sort by (e.g., 'name', 'email')
  sort_order?: 'asc' | 'desc';  // Sort direction
}

export interface UnitMinimalQueryParams {
  search?: string;
  departmentId?: string;
  parentUnitId?: string;
  districtId?: string;
  include_deleted?: boolean;
}

// Post count response item
export interface PostCountItem {
  label: string;
  count: number;
}

// Post count API response
export interface PostCountResponse {
  counts: PostCountItem[];
  total: number;
}

// OrgNode interface for tree structure
export interface OrgNode {
  id: string;
  name: string;
  role: string;
  department: string;
  location: string;
  status?: string;
  imageUrl?: string;
  reportCount?: number;
  isDirector?: boolean;
  children?: OrgNode[];
}

export const unitsService = {
  // Returns full paginated response with metadata
  getAll: async (params?: UnitQueryParams): Promise<PaginatedResponse<Unit>> => {
    console.log('Units Service - getAll called with params:', params);
    const response = await api.get<PaginatedResponse<Unit>>('/api/v1/units/list', { params });
    console.log('Units Service - API response:', response.config.url, response.config.params);
    return response.data;
  },

  // Get all units for dropdown (returns array, no pagination)
  getAllForDropdown: async (): Promise<Unit[]> => {
    const response = await api.get<PaginatedResponse<Unit>>('/api/v1/units/list', {
      params: {  include_deleted: false },
    });
    return response.data.data || [];
  },

  // Get all units for export (returns array, no pagination)
  getAllForExport: async (params?: Omit<UnitQueryParams, 'page' | 'page_size'>): Promise<Unit[]> => {
    const response = await api.get<PaginatedResponse<Unit>>('/api/v1/units/list', {
      params: { ...params, page_size: 1000 },
    });
    return response.data.data || [];
  },

  /**
   * Export units as Excel file
   * GET /api/v1/units/export
   */
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/units/export', {
      responseType: 'blob',
    });
    return response.data;
  },

  // Lightweight endpoint for dropdowns/selects
  getMinimalList: async (params?: UnitMinimalQueryParams): Promise<UnitMinimal[]> => {
    console.log('Units Service - getMinimalList called with params:', params);
    const response = await api.get<ApiResponse<UnitMinimal[]>>('/api/v1/units/list-minimal', { params });
    console.log('Units Service - getMinimalList response:', response.data);
    return response.data.data;
  },

  getById: async (id: string): Promise<Unit> => {
    const response = await api.get<ApiResponse<Unit>>(`/api/v1/units/get/${id}`);
    return response.data.data;
  },

  // Get unit hierarchy (unit and its parent units) - returns single unit with nested parentUnit
  getUnitHierarchy: async (id: string): Promise<Unit> => {
    const response = await api.get<ApiResponse<Unit>>(`/api/v1/units/get/${id}`);
    return response.data.data;
  },

  create: async (data: UnitCreateRequest): Promise<Unit> => {
    const response = await api.post<ApiResponse<Unit>>('/api/v1/units/create', data);
    return response.data.data;
  },

  update: async (id: string, data: Partial<UnitCreateRequest>): Promise<Unit> => {
    const response = await api.put<ApiResponse<Unit>>(`/api/v1/units/update/${id}`, data);
    return response.data.data;
  },

  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<ApiResponse<DeleteResponse>>(`/api/v1/units/delete/${id}`);
    return response.data.data;
  },

  restore: async (id: string): Promise<Unit> => {
    console.log('Units Service - restore called for unit:', id);
    const response = await api.patch<ApiResponse<Unit>>(`/api/v1/units/restore/${id}`);
    console.log('Units Service - restore response:', response.data);
    return response.data.data;
  },

  // Search is handled via the getAll method with search parameter in list endpoint
  search: async (searchTerm: string): Promise<PaginatedResponse<Unit>> => {
    const response = await api.get<PaginatedResponse<Unit>>('/api/v1/units/list', {
      params: { search: searchTerm }
    });
    return response.data;
  },

  // ============================================================
  // EMBEDDED POST OPERATIONS
  // ============================================================

  // Get posts count by post name for a unit
  getPostsCount: async (unitId: string, includeDeleted: boolean = false): Promise<PostCountResponse> => {
    const response = await api.get<ApiResponse<PostCountResponse>>(`/api/v1/units/${unitId}/posts/count`, {
      params: { include_deleted: includeDeleted }
    });
    console.log('[Units Service] getPostsCount response:', response.data);
    return response.data.data;
  },

  // Add a new post to unit
  addPost: async (unitId: string, post: EmbeddedPostCreateRequest): Promise<Unit> => {
    const response = await api.post<ApiResponse<Unit>>(`/api/v1/units/${unitId}/posts`, post);
    return response.data.data;
  },

  // Update an existing post
  updatePost: async (unitId: string, postCode: string, data: EmbeddedPostUpdateRequest): Promise<Unit> => {
    const response = await api.patch<ApiResponse<Unit>>(`/api/v1/units/${unitId}/posts/${postCode}`, data);
    return response.data.data;
  },

  // Delete (soft delete) a post
  deletePost: async (unitId: string, postCode: string): Promise<Unit> => {
    const response = await api.delete<ApiResponse<Unit>>(`/api/v1/units/${unitId}/posts/${postCode}`);
    return response.data.data;
  },

  // Assign a user to a post (single user)
  assignUserToPost: async (unitId: string, postCode: string, userId: string): Promise<Unit> => {
    const payload: PostAssignUserRequest = { userId };
    const response = await api.post<ApiResponse<Unit>>(`/api/v1/units/${unitId}/posts/${postCode}/assign`, payload);
    return response.data.data;
  },

  // Unassign user from a post
  unassignUserFromPost: async (unitId: string, postCode: string): Promise<Unit> => {
    const response = await api.delete<ApiResponse<Unit>>(`/api/v1/units/${unitId}/posts/${postCode}/unassign`);
    return response.data.data;
  },

  // Set roles for a post (replaces existing roles)
  setPostRoles: async (unitId: string, postCode: string, roleIds: string[]): Promise<Unit> => {
    const payload: PostRolesRequest = { roleIds };
    const response = await api.put<ApiResponse<Unit>>(`/api/v1/units/${unitId}/posts/${postCode}/roles`, payload);
    return response.data.data;
  },

  // Add roles to a post (appends to existing roles)
  addPostRoles: async (unitId: string, postCode: string, roleIds: string[]): Promise<Unit> => {
    const payload: PostRolesRequest = { roleIds };
    const response = await api.post<ApiResponse<Unit>>(`/api/v1/units/${unitId}/posts/${postCode}/roles`, payload);
    return response.data.data;
  },

  // Remove roles from a post
  removePostRoles: async (unitId: string, postCode: string, roleIds: string[]): Promise<Unit> => {
    const payload: PostRolesRequest = { roleIds };
    const response = await api.delete<ApiResponse<Unit>>(`/api/v1/units/${unitId}/posts/${postCode}/roles`, { data: payload });
    return response.data.data;
  },

  // ============================================================
  // UNIT HIERARCHY / TREE STRUCTURE
  // ============================================================

  /**
   * Get all units for hierarchical tree structure
   * Returns flat list of units for building tree in UI
   */
  getUnitTree: async (): Promise<Unit[]> => {
    const response = await api.get<ApiResponse<Unit[]>>('/api/v1/units/list-all', {
      params: { include_deleted: false }
    });
    return response.data.data || [];
  },

  // ============================================================
  // UNIT POST ASSIGNMENT HELPERS (for personnel onboarding)
  // ============================================================

  /**
   * Get all units with their available (vacant) posts
   * Returns units that have at least one post where assignedUser is null
   */
  getUnitsWithAvailablePosts: async (): Promise<Array<{
    unitId: string;
    unitName: string;
    posts: Array<{
      postCode: string;
      postName: string;
      assignedRoles: string[];
      isUnitHead: boolean;
    }>;
  }>> => {
    // Get all units with their posts
    const response = await api.get<PaginatedResponse<Unit>>('/api/v1/units/list', {
      params: { include_deleted: false, page_size: 1000 },
    });
    const units = response.data.data || [];

    // Filter to units with available posts and transform
    return units
      .map(unit => {
        const availablePosts = (unit.posts || [])
          .filter(post => !post.isDelete && !post.assignedUser)
          .map(post => ({
            postCode: post.postCode,
            postName: post.postName,
            assignedRoles: post.assignedRoles?.map(r => r._id) || [],
            isUnitHead: post.isUnitHead || false,
          }));

        return {
          unitId: unit._id,
          unitName: unit.name,
          posts: availablePosts,
        };
      })
      .filter(unit => unit.posts.length > 0); // Only return units with available posts
  },

  /**
   * Get all posts across all units (both vacant and filled) for display
   */
  getAllPostsForSelection: async (): Promise<Array<{
    unitId: string;
    unitName: string;
    postCode: string;
    postName: string;
    assignedUser: string | null;
    assignedRoles: string[];
    isUnitHead: boolean;
    isVacant: boolean;
  }>> => {
    const response = await api.get<PaginatedResponse<Unit>>('/api/v1/units/list', {
      params: { include_deleted: false, page_size: 1000 },
    });
    const units = response.data.data || [];

    const allPosts: Array<{
      unitId: string;
      unitName: string;
      postCode: string;
      postName: string;
      assignedUser: string | null;
      assignedRoles: string[];
      isUnitHead: boolean;
      isVacant: boolean;
    }> = [];

    units.forEach(unit => {
      (unit.posts || [])
        .filter(post => !post.isDelete)
        .forEach(post => {
          allPosts.push({
            unitId: unit._id,
            unitName: unit.name,
            postCode: post.postCode,
            postName: post.postName,
            assignedUser: post.assignedUser?._id || null,
            assignedRoles: post.assignedRoles?.map(r => r._id) || [],
            isUnitHead: post.isUnitHead || false,
            isVacant: !post.assignedUser,
          });
        });
    });

    return allPosts;
  },
};
