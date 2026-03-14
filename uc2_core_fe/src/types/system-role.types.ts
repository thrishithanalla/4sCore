/**
 * System Role Types
 * Types for the System Role management feature
 */

// Individual permission action (CREATE, READ, UPDATE, DELETE)
export interface PermissionAction {
  name: string;
  isSelf?: boolean;
}

// Job within a module's role permissions
export interface RoleJob {
  jobName: string;
  displayName: string;
  route?: string;
  isMenu?: boolean;
  displayOrder?: number;
  permissions: PermissionAction[];
}

// Module permission within roleData
export interface RoleDataPermission {
  moduleId: string;
  moduleName: string;
  jobs: RoleJob[];
}

// RoleData containing nested permissions
export interface RoleData {
  _id?: string;
  roleName?: string;
  roleShortCode?: string;
  description?: string;
  permissions: RoleDataPermission[];
  jobs?: RoleJob[];
}

// Permission item in a system role (top-level)
export interface SystemRolePermission {
  moduleId: string;
  moduleName: string;
  roleId: string;
  roleName: string;
  roleData?: RoleData;
}

// System Role entity
export interface SystemRole {
  _id: string;
  roleName: string;
  roleShortCode: string;
  description?: string;
  roleBinding: SystemRolePermission[];
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

// Role option in module dropdown
export interface ModuleRole {
  roleId: string;
  roleName: string;
  roleShortCode: string;
}

// Module with roles (from modules-with-roles endpoint)
export interface ModuleWithRoles {
  moduleId: string;
  moduleName: string;
  roles: ModuleRole[];
}

// Query parameters for system roles list
export interface SystemRoleQueryParams {
  include_deleted?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// Create system role payload
export interface CreateSystemRolePayload {
  roleName: string;
  roleShortCode: string;
  description?: string;
  roleBinding: SystemRolePermission[];
}

// Update system role payload (all fields optional)
export interface UpdateSystemRolePayload {
  roleName?: string;
  roleShortCode?: string;
  description?: string;
  roleBinding?: SystemRolePermission[];
}
