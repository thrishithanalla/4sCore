/**
 * Post Role Mapping Types
 * Types for the Post Role Mapping management feature
 */

import type { SystemRolePermission } from './system-role.types';

// Permission in additional/exclusion arrays
export interface PostRoleMappingPermission {
  name: string;
  isSelf: boolean;
}

// Job in additional/exclusion arrays
export interface PostRoleMappingJob {
  jobName: string;
  permissions: PostRoleMappingPermission[];
}

// Module in additional/exclusion arrays
export interface PostRoleMappingModule {
  moduleId: string;
  moduleName: string;
  jobs: PostRoleMappingJob[];
}

// Consolidated permission job (with isMenu and displayOrder)
export interface ConsolidatedJob {
  jobName: string;
  isMenu?: boolean;
  displayOrder?: number;
  permissions: PostRoleMappingPermission[];
}

// Consolidated permission module
export interface ConsolidatedModule {
  moduleId: string;
  moduleName: string;
  jobs: ConsolidatedJob[];
}

// Role data within system role (for display in view)
export interface RoleData {
  _id: string;
  name: string;
  permissions: ConsolidatedModule[];
}

// System role permission with role data
export interface SystemRolePermissionWithData extends SystemRolePermission {
  roleData?: RoleData;
}

// System role data (embedded in response)
export interface SystemRoleData {
  _id: string;
  roleName: string;
  roleShortCode: string;
  description?: string;
  roleBinding: SystemRolePermissionWithData[];
}

// Main Post Role Mapping entity
export interface PostRoleMapping {
  _id: string;
  postId: string;
  postName?: string; // Enriched from post_master
  systemRoleId: string;
  systemRoleName?: string; // Enriched from rank_roles
  systemRoleShortCode?: string; // Enriched from rank_roles
  additionalPermissions: PostRoleMappingModule[];
  exclusionPermissions: PostRoleMappingModule[];
  permissions?: ConsolidatedModule[]; // Consolidated final permissions
  systemRoleData?: SystemRoleData; // Full system role data
  isActive: boolean;
  isDelete: boolean;
  createdBy?: string | null;
  updatedBy?: string | null;
  deletedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
  createdIp?: string | null;
}

// Query parameters for list endpoint
export interface PostRoleMappingQueryParams {
  include_deleted?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
  postId?: string;
  systemRoleId?: string;
}

// System role data for create payload (when isCreate=true)
export interface CreateSystemRoleData {
  roleName: string;
  roleShortCode: string;
  description?: string;
  roleBinding: SystemRolePermission[];
}

// Create payload
export interface CreatePostRoleMappingPayload {
  postId: string;
  isCreate: boolean;
  systemRoleId?: string; // Required when isCreate=false
  systemRoleData?: CreateSystemRoleData; // Required when isCreate=true
  additionalPermissions?: PostRoleMappingModule[];
  exclusionPermissions?: PostRoleMappingModule[];
}

// Update payload
export interface UpdatePostRoleMappingPayload {
  postId?: string;
  systemRoleData?: CreateSystemRoleData;
  additionalPermissions?: PostRoleMappingModule[];
  exclusionPermissions?: PostRoleMappingModule[];
}
