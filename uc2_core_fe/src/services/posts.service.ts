import { api } from './api';
import type {
  Post,
  PostCreateRequest,
  PostUpdateRequest,
  PostWithStats,
  PostQueryParams,
  PostAssignRequest,
  PostUnassignRequest,
  DeleteResponse,
  PaginatedResponse,
} from '../types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export const postsService = {
  /**
   * Get all posts with stats (sanctioned, filled, vacant)
   */
  getAll: async (params?: PostQueryParams): Promise<PaginatedResponse<PostWithStats>> => {
    const response = await api.get<PaginatedResponse<PostWithStats>>('/api/v1/posts/list-with-stats', { params });
    return response.data;
  },

  /**
   * Get all posts for dropdown (includes unitName for display)
   */
  getAllForDropdown: async (unitId?: string): Promise<Post[]> => {
    const params: PostQueryParams = { include_deleted: false, is_active: true };
    if (unitId) {
      params.unit_id = unitId;
    }
    // Use list-with-stats to get unitName for display in dropdowns
    const response = await api.get<any>('/api/v1/posts/list-with-stats', { params });
    // Handle both formats: direct array or paginated response
    const data = response.data;
    if (Array.isArray(data)) {
      return data;
    }
    // Paginated response format
    return data?.data || [];
  },

  /**
   * Get post by ID with full details including positions
   */
  getById: async (id: string): Promise<Post> => {
    const response = await api.get<ApiResponse<Post>>(`/api/v1/posts/get/${id}`);
    return response.data.data;
  },

  /**
   * Create new post
   */
  create: async (payload: PostCreateRequest): Promise<Post> => {
    const response = await api.post<ApiResponse<Post>>('/api/v1/posts/create', payload);
    return response.data.data;
  },

  /**
   * Update post
   */
  update: async (id: string, payload: PostUpdateRequest): Promise<Post> => {
    const response = await api.put<ApiResponse<Post>>(`/api/v1/posts/update/${id}`, payload);
    return response.data.data;
  },

  /**
   * Delete post (soft delete)
   */
  delete: async (id: string): Promise<DeleteResponse> => {
    const response = await api.delete<ApiResponse<DeleteResponse>>(`/api/v1/posts/delete/${id}`);
    return response.data.data;
  },

  /**
   * Assign personnel to a position
   */
  assignPersonnel: async (postId: string, payload: PostAssignRequest): Promise<Post> => {
    const response = await api.post<ApiResponse<Post>>(`/api/v1/posts/${postId}/assign`, payload);
    return response.data.data;
  },

  /**
   * Unassign personnel from a position
   */
  unassignPersonnel: async (postId: string, payload: PostUnassignRequest): Promise<Post> => {
    const response = await api.post<ApiResponse<Post>>(`/api/v1/posts/${postId}/unassign`, payload);
    return response.data.data;
  },

  /**
   * Restore deleted post
   */
  restore: async (id: string): Promise<Post> => {
    const response = await api.patch<ApiResponse<Post>>(`/api/v1/posts/restore/${id}`);
    return response.data.data;
  },
};
