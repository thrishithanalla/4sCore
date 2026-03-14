/**
 * User Role Mapping Service
 * Handles API calls for user-role-permission mappings
 */

import { api } from './api';
import { fetchRolesForDropdown, type Role } from './roles.service';
import { personnelService } from './personnel.service';
import { unitsService } from './units.service';
import type { Personnel, Unit } from '../types';

// Cache for lookup data to reduce API calls
let lookupCache: {
  roles: Role[];
  personnel: Personnel[];
  units: Unit[];
  timestamp: number;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Get cached lookup data or fetch fresh if expired
 */
const getLookupData = async () => {
  const now = Date.now();
  if (lookupCache && now - lookupCache.timestamp < CACHE_TTL) {
    return lookupCache;
  }

  const [roles, personnel, units] = await Promise.all([
    fetchRolesForDropdown(),
    personnelService.getAllForDropdown(),
    unitsService.getAllForDropdown(),
  ]);

  lookupCache = { roles, personnel, units, timestamp: now };
  return lookupCache;
};

/**
 * Clear the lookup cache (call after create/update/delete operations if needed)
 */
export const clearLookupCache = () => {
  lookupCache = null;
};

// Permission structure for additional/exclusion permissions
export interface PermissionItem {
  name: string;
  isSelf: boolean;
}

export interface JobPermission {
  jobName: string;
  isMenu: boolean;
  displayOrder?: number;
  permissions: PermissionItem[];
}

export interface ModulePermission {
  moduleId: string;
  moduleName: string;
  jobs: JobPermission[];
}

// User Role Mapping types
export interface UserRoleMapping {
  _id: string;
  roleId: string;
  userId: string;
  unitId: string;
  additionalPermissions: ModulePermission[];
  exclusionPermissions: ModulePermission[];
  isDelete: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  // Populated fields
  role?: {
    _id: string;
    name: string;
    shortCode: string;
  };
  user?: {
    _id: string;
    firstName: string;
    lastName: string;
    name: string;
    userId: string;
  };
  unit?: {
    _id: string;
    name: string;
    policeReferenceId: string;
  };
}

export interface UserRoleMappingCreateRequest {
  roleId: string;
  userId: string;
  unitId: string;
  additionalPermissions: ModulePermission[];
  exclusionPermissions: ModulePermission[];
}

export interface UserRoleMappingUpdateRequest {
  roleId?: string;
  unitId?: string;
  additionalPermissions?: ModulePermission[];
  exclusionPermissions?: ModulePermission[];
}

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

/**
 * Fetch all user role mappings with populated names
 */
export const fetchUserRoleMappings = async (): Promise<UserRoleMapping[]> => {
  try {
    // Fetch mappings and cached lookup data in parallel
    const [mappingsResponse, lookupData] = await Promise.all([
      api.get<ApiResponse<UserRoleMapping[]>>('/api/v1/user-role-permissions/list'),
      getLookupData(),
    ]);

    const mappings = mappingsResponse.data.data;
    const { roles, personnel, units } = lookupData;

    // Create lookup maps for efficient name resolution
    const rolesMap = new Map(roles.map((r) => [r._id, r]));
    const personnelMap = new Map(personnel.map((p) => [p._id, p]));
    const unitsMap = new Map(units.map((u) => [u._id, u]));

    // Populate names for each mapping
    return mappings.map((mapping) => {
      const role = rolesMap.get(mapping.roleId);
      const user = personnelMap.get(mapping.userId);
      const unit = unitsMap.get(mapping.unitId);

      return {
        ...mapping,
        role: role
          ? { _id: role._id, name: role.name, shortCode: role.shortCode }
          : undefined,
        user: user
          ? {
              _id: user._id,
              firstName: user.firstName,
              lastName: user.lastName,
              name: user.name || `${user.firstName} ${user.lastName}`,
              userId: user.userId,
            }
          : undefined,
        unit: unit
          ? { _id: unit._id, name: unit.name, policeReferenceId: unit.policeReferenceId || '' }
          : undefined,
      };
    });
  } catch (error) {
    console.error('Error fetching user role mappings:', error);
    throw error;
  }
};

/**
 * Get user role mapping by ID with populated names
 */
export const getUserRoleMappingById = async (id: string): Promise<UserRoleMapping> => {
  try {
    // Fetch mapping and cached lookup data in parallel
    const [response, lookupData] = await Promise.all([
      api.get<ApiResponse<UserRoleMapping>>(`/api/v1/user-role-permissions/get/${id}`),
      getLookupData(),
    ]);

    const mapping = response.data.data;
    const { roles, personnel, units } = lookupData;

    // Find related entities
    const role = roles.find((r) => r._id === mapping.roleId);
    const user = personnel.find((p) => p._id === mapping.userId);
    const unit = units.find((u) => u._id === mapping.unitId);

    return {
      ...mapping,
      role: role
        ? { _id: role._id, name: role.name, shortCode: role.shortCode }
        : undefined,
      user: user
        ? {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name || `${user.firstName} ${user.lastName}`,
            userId: user.userId,
          }
        : undefined,
      unit: unit
        ? { _id: unit._id, name: unit.name, policeReferenceId: unit.policeReferenceId || '' }
        : undefined,
    };
  } catch (error) {
    console.error('Error fetching user role mapping:', error);
    throw error;
  }
};

/**
 * Create a new user role mapping
 */
export const createUserRoleMapping = async (data: UserRoleMappingCreateRequest): Promise<UserRoleMapping> => {
  try {
    const response = await api.post<ApiResponse<UserRoleMapping>>('/api/v1/user-role-permissions/create', data);
    return response.data.data;
  } catch (error) {
    console.error('Error creating user role mapping:', error);
    throw error;
  }
};

/**
 * Update a user role mapping
 */
export const updateUserRoleMapping = async (id: string, data: UserRoleMappingUpdateRequest): Promise<UserRoleMapping> => {
  try {
    const response = await api.put<ApiResponse<UserRoleMapping>>(`/api/v1/user-role-permissions/update/${id}`, data);
    return response.data.data;
  } catch (error) {
    console.error('Error updating user role mapping:', error);
    throw error;
  }
};

/**
 * Delete a user role mapping
 */
export const deleteUserRoleMapping = async (id: string): Promise<void> => {
  try {
    await api.delete(`/api/v1/user-role-permissions/delete/${id}`);
  } catch (error) {
    console.error('Error deleting user role mapping:', error);
    throw error;
  }
};
