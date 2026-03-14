/**
 * usePermissions Hook for UC2 Core Service
 * Wraps main_fe's permission hooks for use in UC2
 *
 * NOTE: RBAC is currently DISABLED — backend has no RBAC.
 * All permission checks return true / allowed.
 * To re-enable, restore the original permission-checking logic.
 */

import { useMemo, useCallback } from 'react';

interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Main permissions hook for UC2
 * RBAC DISABLED: all checks grant access.
 */
export function usePermissions() {
  const hasPermission = useCallback(
    (_jobName: string, _permission: string): PermissionCheckResult => {
      return { allowed: true };
    },
    []
  );

  const canCreate = useCallback((_jobName: string): boolean => true, []);
  const canRead = useCallback((_jobName: string): boolean => true, []);
  const canUpdate = useCallback((_jobName: string): boolean => true, []);
  const canDelete = useCallback((_jobName: string): boolean => true, []);
  const canExecute = useCallback((_jobName: string): boolean => true, []);

  const getJobPermissions = useCallback(
    (_jobName: string): string[] => ['create', 'read', 'update', 'delete', 'execute'],
    []
  );

  const hasAccessToJob = useCallback((_jobName: string): boolean => true, []);

  const accessibleJobs = useMemo(() => [] as string[], []);

  return {
    hasPermission,
    canCreate,
    canRead,
    canUpdate,
    canDelete,
    canExecute,
    hasAccessToJob,
    getJobPermissions,
    accessibleJobs,
    permissionsData: null,
    normalizedPermissions: { modules: {}, jobs: {} },
    isLoaded: true,
  };
}

/** RBAC DISABLED: always returns true */
export function useCanCreate(_jobName: string): boolean { return true; }
export function useCanRead(_jobName: string): boolean { return true; }
export function useCanUpdate(_jobName: string): boolean { return true; }
export function useCanDelete(_jobName: string): boolean { return true; }
export function useHasJobAccess(_jobName: string): boolean { return true; }
