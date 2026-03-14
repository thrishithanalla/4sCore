/**
 * RoleSelector Component
 * Reusable multi-select dropdown for selecting roles from usecase_roles collection.
 * Can be used in Units (embedded posts), PostRoleMapping, Assignments, etc.
 */

import { memo, forwardRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from 'primereact/skeleton';
import { FloatLabelMultiSelect, SelectOption } from 'mainFe/FloatLabelMultiSelect';
import { fetchRolesForDropdown, Role } from '../../services/roles.service';

interface RoleSelectorProps {
  name?: string;
  label?: string;
  value: string[];
  onChange: (roleIds: string[]) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  error?: boolean;
  helperText?: string;
  maxSelectedLabels?: number;
  display?: 'comma' | 'chip';
}

const RoleSelector = memo(forwardRef<HTMLDivElement, RoleSelectorProps>(({
  name = 'roles',
  label = 'Roles',
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = 'Select roles...',
  error = false,
  helperText = '',
  maxSelectedLabels = 3,
  display = 'chip',
}, ref) => {
  // Fetch roles from usecase_roles collection
  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ['roles', 'dropdown'],
    queryFn: fetchRolesForDropdown,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Transform roles to dropdown options
  const roleOptions: SelectOption[] = useMemo(() => {
    return roles.map((role) => ({
      value: role._id,
      label: role.name,
    }));
  }, [roles]);

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
      options={roleOptions}
      error={error}
      helperText={helperText}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      filter
      filterPlaceholder="Search roles..."
      showClear
      display={display}
      maxSelectedLabels={maxSelectedLabels}
      className="w-full"
      testId={`${name}-role-selector`}
    />
  );
}));

RoleSelector.displayName = 'RoleSelector';

export default RoleSelector;
