/**
 * Role Management Types
 */

export interface Permission {
  module: string;
  resources: string[];
}

export interface Role {
  _id: string;
  roleName: string;
  description: string;
  roleAccessFor: string[];
  isViewOnly: boolean;
  permissions: Permission[];
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

export interface CreateRolePayload {
  roleName: string;
  description: string;
  roleAccessFor: string[];
  isViewOnly: boolean;
  permissions: Permission[];
}

export interface UpdateRolePayload extends Partial<CreateRolePayload> {
  _id: string;
}

export interface RoleQueryParams {
  include_deleted?: boolean;
  roleAccessFor?: string;
}
