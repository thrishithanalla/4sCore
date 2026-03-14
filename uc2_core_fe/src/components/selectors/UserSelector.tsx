/**
 * UserSelector Component
 * Reusable single-select dropdown for selecting a personnel/user.
 * Returns a SINGLE user ID (not array).
 * Can be used in Units (embedded posts), Assignments, etc.
 */

import { useState, useEffect, memo, forwardRef, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from 'primereact/skeleton';
import { FloatLabelDropdown, SelectOption } from 'mainFe/FloatLabelDropdown';
import { masterService } from '../../services/master.service';
import { useDebounce } from '../../hooks/useDebounce';

// Stable empty arrays to prevent infinite re-renders
const EMPTY_RANK_SHORT_CODES: string[] = [];
const EMPTY_USERS: { _id: string; userId: string; name: string; firstName: string; lastName: string; email: string }[] = [];

interface UserSelectorProps {
  name?: string;
  label?: string;
  value: string | null;
  onChange: (userId: string | null) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  error?: boolean;
  helperText?: string;
  /** Pre-selected user info for display when value is set */
  selectedUserLabel?: string | null;
  /** Optional rank shortCodes to filter personnel by ranks using the by-ranks API */
  rankShortCodes?: string[];
}

const UserSelector = memo(forwardRef<HTMLDivElement, UserSelectorProps>(({
  name = 'user',
  label = 'Assigned User',
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = 'Search and select user...',
  error = false,
  helperText = '',
  selectedUserLabel = null,
  rankShortCodes = EMPTY_RANK_SHORT_CODES,
}, ref) => {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [filterValue, setFilterValue] = useState('');

  // Create stable key for ranks to avoid infinite re-renders
  const ranksKey = useMemo(() =>
    rankShortCodes && rankShortCodes.length > 0 ? rankShortCodes.slice().sort().join(',') : '',
    [rankShortCodes]
  );

  // Store rankShortCodes in a ref to avoid stale closures
  const rankShortCodesRef = useRef(rankShortCodes);
  rankShortCodesRef.current = rankShortCodes;

  // Check if we should use the by-ranks API
  const useByRanksApi = ranksKey.length > 0;

  // Fetch initial users for dropdown (limited set) - uses by-ranks API if rankShortCodes provided
  const { data: initialUsers = EMPTY_USERS, isLoading: initialLoading } = useQuery({
    queryKey: useByRanksApi ? ['personnel', 'by-ranks', ranksKey] : ['personnel', 'dropdown'],
    queryFn: () => useByRanksApi ? masterService.getPersonnelByRanks(rankShortCodesRef.current) : masterService.getUsersForDropdown(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !useByRanksApi || ranksKey.length > 0,
  });

  // Transform users to options
  const initialOptions = useMemo((): SelectOption[] => {
    return initialUsers.map((user) => {
      const displayName = user.name || `${user.firstName} ${user.lastName}`;
      return {
        value: user._id,
        label: `${displayName} (${user.userId})`,
      };
    });
  }, [initialUsers]);

  // Store refs for stable references
  const initialOptionsRef = useRef(initialOptions);

  useEffect(() => {
    initialOptionsRef.current = initialOptions;
    if (filterValue.trim().length === 0) {
      setOptions(initialOptions);
    }
  }, [initialOptions, filterValue]);

  const debouncedFilter = useDebounce(filterValue, 500);

  // Helper to ensure selected option is in the list
  const mergeSelectedOption = useCallback((optionsList: SelectOption[]): SelectOption[] => {
    if (!value) return optionsList;

    // Check if current value is already in the list
    const exists = optionsList.some(opt => opt.value === value);
    if (exists) return optionsList;

    // If we have a label for the selected user, add it
    if (selectedUserLabel) {
      return [{ value, label: selectedUserLabel }, ...optionsList];
    }

    return optionsList;
  }, [value, selectedUserLabel]);

  // Search users when filter changes
  useEffect(() => {
    const searchUsers = async () => {
      if (debouncedFilter.trim().length === 0) {
        setOptions(mergeSelectedOption(initialOptionsRef.current));
        return;
      }

      setSearchLoading(true);
      try {
        // Use by-ranks API for search if rankShortCodes are provided
        const results = useByRanksApi
          ? await masterService.searchPersonnelByRanks(rankShortCodesRef.current, debouncedFilter)
          : await masterService.searchPersonnel(debouncedFilter);
        const searchOptions: SelectOption[] = results.map((user) => {
          const displayName = user.name || `${user.firstName} ${user.lastName}`;
          return {
            value: user._id,
            label: `${displayName} (${user.userId})`,
          };
        });
        setOptions(mergeSelectedOption(searchOptions));
      } catch (err) {
        console.error('Error searching personnel:', err);
        setOptions(mergeSelectedOption([]));
      } finally {
        setSearchLoading(false);
      }
    };

    searchUsers();
  }, [debouncedFilter, mergeSelectedOption, useByRanksApi, ranksKey]);

  // Handle selection change
  const handleChange = useCallback((e: { target: { name: string; value: string } }) => {
    setFilterValue(''); // Clear filter on selection
    onChange(e.target.value || null);
  }, [onChange]);

  if (initialLoading) {
    return (
      <div className="w-full">
        <Skeleton height="56px" className="w-full rounded-md" />
      </div>
    );
  }

  return (
    <FloatLabelDropdown
      ref={ref}
      name={name}
      label={label}
      value={value || ''}
      onChange={handleChange}
      options={options}
      error={error}
      helperText={helperText}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      filter
      filterPlaceholder="Search personnel..."
      showClear
      loading={searchLoading}
      onFilter={(e: { filter: string }) => setFilterValue(e.filter)}
      emptyFilterMessage={searchLoading ? 'Searching...' : 'No personnel found'}
      className="w-full"
      testId={`${name}-user-selector`}
      appendTo={document.body}
    />
  );
}));

UserSelector.displayName = 'UserSelector';

export default UserSelector;
