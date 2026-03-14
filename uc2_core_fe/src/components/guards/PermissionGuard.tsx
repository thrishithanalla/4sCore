/**
 * PermissionGuard Component
 *
 * NOTE: RBAC is currently DISABLED — backend has no RBAC.
 * Always renders children. To re-enable, restore the original logic.
 */

import { ReactNode } from 'react';

interface PermissionGuardProps {
  jobName: string;
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
  resourceName?: string;
}

export const PermissionGuard = ({ children }: PermissionGuardProps) => {
  return <>{children}</>;
};

export default PermissionGuard;
