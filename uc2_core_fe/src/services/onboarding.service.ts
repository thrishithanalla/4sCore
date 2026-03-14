import { api } from './api';
import type { Personnel, PostWithStats, PaginatedResponse } from '../types';
import type { ModulePermission } from './user-role-mapping.service';

// Role mapping for onboarding
export interface OnboardingRoleMapping {
  roleId: string;
  unitId: string;
  additionalPermissions?: ModulePermission[];
  exclusionPermissions?: ModulePermission[];
}

// Unit assignment for onboarding
export interface OnboardingUnitAssignment {
  unitId: string;
  designationId?: string;
}

// Post assignment for onboarding (new schema)
export interface OnboardingPostAssignment {
  postId: string;
}

// Request payload for onboarding/create endpoint
// Note: posts is now optional - assignments are created separately via assignment API
export interface OnboardingCreateRequest {
  email: string;
  name: string;
  userId: string;
  password?: string; // Default password for the user
  mpin?: number;
  title?: string;
  gender?: string;
  mobile?: string;
  dateOfBirth?: string;
  batchYear?: number;
  badgeNo?: string;
  picture?: string;
  departmentId: string;
  rankId: string;
  posts?: OnboardingPostAssignment[]; // Optional - assignments handled separately
}

// Response from onboarding/create endpoint
export interface OnboardingCreateResponse {
  personnel: Personnel;
  posts: OnboardingPostResponseItem[];
}

// Post response item with role info
export interface OnboardingPostResponseItem {
  postId: string;
  postName?: string;
  roleId?: string;
  roleName?: string;
  unitId?: string;
  unitName?: string;
  isActive: boolean;
}

// Post role mapping response (with consolidated permissions)
export interface PostRoleMapping {
  _id: string;
  postId: string;
  roleId?: string;
  systemRoleId?: string;
  // Root level fields from API
  postName?: string;
  roleName?: string;
  systemRoleName?: string; // From rank_roles enrichment
  systemRoleShortCode?: string; // From rank_roles enrichment
  // Permissions at root level (consolidated from role + additional - exclusion)
  permissions?: ModulePermission[];
  additionalPermissions?: ModulePermission[];
  exclusionPermissions?: ModulePermission[];
  isActive: boolean;
  isDelete: boolean;
  // Optional nested objects (may be present in some responses)
  post?: {
    _id: string;
    postName: string;
    postCode?: string;
    unitId?: string;
    unitName?: string;
  };
  role?: {
    _id: string;
    name: string;
    shortCode?: string;
    permissions: ModulePermission[];
  };
  // System role data (from post-role-mapping API)
  systemRoleData?: {
    _id: string;
    roleName: string;
    roleShortCode?: string;
    description?: string;
  };
  consolidatedPermissions?: ModulePermission[];
}

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export const onboardingService = {
  /**
   * Create personnel with post assignments in a single API call
   * Endpoint: POST /api/v1/onboarding/create
   */
  create: async (data: OnboardingCreateRequest): Promise<OnboardingCreateResponse> => {
    const response = await api.post<{ data: OnboardingCreateResponse }>('/api/v1/onboarding/create', data);
    return response.data.data;
  },

  /**
   * Get posts with stats by unit ID
   * Endpoint: GET /api/v1/posts/list-with-stats?unit_id=<unitId>
   */
  getPostsWithStatsByUnit: async (unitId: string): Promise<PostWithStats[]> => {
    const response = await api.get<PaginatedResponse<PostWithStats>>('/api/v1/posts/list-with-stats', {
      params: {
        unit_id: unitId,
        include_deleted: false,
        is_active: true,
      },
    });
    return response.data.data || [];
  },

  /**
   * Get post role mapping by post ID
   * Endpoint: GET /api/v1/post-role-mappings/list?postId=<postId>
   */
  getPostRoleMappingByPostId: async (postId: string): Promise<PostRoleMapping | null> => {
    const response = await api.get<PaginatedResponse<PostRoleMapping>>('/api/v1/post-role-mappings/list', {
      params: {
        postId,
      },
    });
    const mappings = response.data.data || [];
    return mappings.length > 0 ? mappings[0] : null;
  },

  /**
   * Get post role mappings for multiple post IDs in a single call
   * Endpoint: GET /api/v1/post-role-mappings/list (fetches all, then filters client-side)
   * Returns a Map of postId -> PostRoleMapping
   */
  getPostRoleMappingsByPostIds: async (postIds: string[]): Promise<Map<string, PostRoleMapping>> => {
    if (postIds.length === 0) return new Map();

    // Fetch all role mappings (or use a batch endpoint if available)
    const response = await api.get<PaginatedResponse<PostRoleMapping>>('/api/v1/post-role-mappings/list', {
      params: {
        page_size: 1000, // Get enough to cover all posts
      },
    });
    const allMappings = response.data.data || [];

    // Create a map of postId -> mapping for quick lookup
    const mappingMap = new Map<string, PostRoleMapping>();
    const postIdSet = new Set(postIds);

    allMappings.forEach(mapping => {
      if (postIdSet.has(mapping.postId)) {
        mappingMap.set(mapping.postId, mapping);
      }
    });

    return mappingMap;
  },

  /**
   * Get post role mapping details with consolidated permissions
   * Endpoint: GET /api/v1/post-role-mappings/get/<mappingId>
   */
  getPostRoleMappingDetails: async (mappingId: string): Promise<PostRoleMapping> => {
    const response = await api.get<ApiResponse<PostRoleMapping>>(`/api/v1/post-role-mappings/get/${mappingId}`);
    return response.data.data;
  },
};
