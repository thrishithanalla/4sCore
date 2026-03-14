/**
 * Post Role Mappings Service
 * Handles API calls for post role mapping management
 */

import { api } from './api';
import type { PaginatedResponse } from '../types';
import type {
  PostRoleMapping,
  PostRoleMappingQueryParams,
  CreatePostRoleMappingPayload,
  UpdatePostRoleMappingPayload,
} from '../types/post-role-mapping.types';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

/**
 * Fetch all post role mappings from /api/v1/post-role-mappings/list
 */
export const fetchPostRoleMappings = async (
  params?: PostRoleMappingQueryParams
): Promise<PaginatedResponse<PostRoleMapping>> => {
  try {
    const response = await api.get<PaginatedResponse<PostRoleMapping>>(
      '/api/v1/post-role-mappings/list',
      { params }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching post role mappings:', error);
    throw error;
  }
};

/**
 * Get post role mapping by ID from /api/v1/post-role-mappings/get/{id}
 */
export const getPostRoleMappingById = async (id: string): Promise<PostRoleMapping> => {
  try {
    const response = await api.get<ApiResponse<PostRoleMapping>>(
      `/api/v1/post-role-mappings/get/${id}`
    );
    return response.data.data;
  } catch (error) {
    console.error('Error fetching post role mapping:', error);
    throw error;
  }
};

/**
 * Create a new post role mapping
 */
export const createPostRoleMapping = async (
  payload: CreatePostRoleMappingPayload
): Promise<PostRoleMapping> => {
  try {
    const response = await api.post<ApiResponse<PostRoleMapping>>(
      '/api/v1/post-role-mappings/create',
      payload
    );
    return response.data.data;
  } catch (error) {
    console.error('Error creating post role mapping:', error);
    throw error;
  }
};

/**
 * Update an existing post role mapping
 */
export const updatePostRoleMapping = async (
  id: string,
  payload: UpdatePostRoleMappingPayload
): Promise<PostRoleMapping> => {
  try {
    const response = await api.put<ApiResponse<PostRoleMapping>>(
      `/api/v1/post-role-mappings/update/${id}`,
      payload
    );
    return response.data.data;
  } catch (error) {
    console.error('Error updating post role mapping:', error);
    throw error;
  }
};

/**
 * Delete a post role mapping by ID (soft delete)
 */
export const deletePostRoleMapping = async (id: string): Promise<void> => {
  try {
    await api.delete(`/api/v1/post-role-mappings/delete/${id}`);
  } catch (error) {
    console.error('Error deleting post role mapping:', error);
    throw error;
  }
};

/**
 * Restore a deleted post role mapping
 */
export const restorePostRoleMapping = async (id: string): Promise<void> => {
  try {
    await api.patch(`/api/v1/post-role-mappings/restore/${id}`);
  } catch (error) {
    console.error('Error restoring post role mapping:', error);
    throw error;
  }
};

// Service object for easier imports
export const postRoleMappingsService = {
  getAll: fetchPostRoleMappings,
  getById: getPostRoleMappingById,
  create: createPostRoleMapping,
  update: updatePostRoleMapping,
  delete: deletePostRoleMapping,
  restore: restorePostRoleMapping,
};
