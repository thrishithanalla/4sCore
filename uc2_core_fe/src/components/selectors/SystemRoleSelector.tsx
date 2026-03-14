/**
 * SystemRoleSelector Component
 * Reusable multi-select dropdown for selecting system roles from rank_roles collection.
 * Used in Units (embedded posts) where assignedRoles now references system roles.
 */

import { memo, forwardRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from 'primereact/skeleton';
import { FloatLabelMultiSelect, SelectOption } from 'mainFe/FloatLabelMultiSelect';
import { fetchSystemRolesForDropdown } from '../../services/system-roles.service';
import type { SystemRole } from '../../types/system-role.types';

interface SystemRoleSelectorProps {
  name?: string;
  label?: string;
  value: string[];
  onChange: (systemRoleIds: string[]) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  error?: boolean;
  helperText?: string;
  maxSelectedLabels?: number;
  display?: 'comma' | 'chip';
}

const SystemRoleSelector = memo(forwardRef<HTMLDivElement, SystemRoleSelectorProps>(({
  name = 'systemRoles',
  label = 'System Roles',
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = 'Select system roles...',
  error = false,
  helperText = '',
  maxSelectedLabels = 3,
  display = 'chip',
}, ref) => {
  // Fetch system roles from rank_roles collection
  const { data: systemRoles = [], isLoading } = useQuery<SystemRole[]>({
    queryKey: ['system-roles', 'dropdown'],
    queryFn: fetchSystemRolesForDropdown,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Transform system roles to dropdown options
  // Display format: "Role Name (SHORT_CODE)" for clarity
  const systemRoleOptions: SelectOption[] = useMemo(() => {
    return systemRoles.map((role) => ({
      value: role._id,
      label: role.roleShortCode
        ? `${role.roleName} (${role.roleShortCode.toUpperCase()})`
        : role.roleName,
    }));
  }, [systemRoles]);

  if (isLoading) {
    return (
      <div className="w-full">
        <Skeleton height="56px" className="w-full rounded-md" />
      </div>
    );
  }

  return (
    <FloatLabelMultiSelect
      ref={ref}
      name={name}
      label={label}
      value={value}
      onChange={onChange}
      options={systemRoleOptions}
      error={error}
      helperText={helperText}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      filter
      filterPlaceholder="Search system roles..."
      showClear
      display={display}
      maxSelectedLabels={maxSelectedLabels}
      className="w-full"
      testId={`${name}-system-role-selector`}
      appendTo={document.body}
    />
  );
}));

SystemRoleSelector.displayName = 'SystemRoleSelector';

export default SystemRoleSelector;
