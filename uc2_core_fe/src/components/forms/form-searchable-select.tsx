import { useState, useEffect, memo, forwardRef, useRef, useCallback, useMemo } from 'react';
import { Skeleton } from 'primereact/skeleton';
import { FloatLabelDropdown, SelectOption } from 'mainFe/FloatLabelDropdown';
import { useDebounce } from '../../hooks/useDebounce';

export type { SelectOption };

export interface LazyLoadResult {
  options: SelectOption[];
  hasMore: boolean;
  total?: number;
}

interface FormSearchableSelectProps {
  name: string;
  label: string;
  value: string;
  onChange: (e: { target: { name: string; value: string } }) => void;
  /** Search function for filtering (resets pagination) */
  onSearch?: (searchTerm: string) => Promise<SelectOption[]>;
  /** Lazy load function for infinite scroll */
  onLazyLoad?: (page: number, searchTerm: string) => Promise<LazyLoadResult>;
  error?: boolean | string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  debounceDelay?: number;
  initialOptions?: SelectOption[];
  /** Alias for initialOptions - for backwards compatibility */
  options?: SelectOption[];
  loading?: boolean;
  /** Option to display for the current value when it's not in initialOptions */
  selectedOption?: SelectOption | null;
  testId?: string;
  /** Page size for lazy loading (default: 10) */
  pageSize?: number;
}

const FormSearchableSelect = memo(forwardRef<HTMLDivElement, FormSearchableSelectProps>(({
  name,
  label,
  value,
  onChange,
  onSearch,
  onLazyLoad,
  error = false,
  helperText = '',
  disabled = false,
  required = false,
  placeholder = 'Search',
  debounceDelay = 500,
  initialOptions: initialOptionsProp = [],
  options: optionsProp = [],
  loading: externalLoading = false,
  selectedOption: selectedOptionProp = null,
  testId,
  pageSize = 10,
}, ref) => {
  // Support both 'options' and 'initialOptions' props
  // Use JSON serialization to create a stable key that only changes when content changes
  const initialOptionsKey = useMemo(
    () => JSON.stringify(initialOptionsProp.length > 0 ? initialOptionsProp : optionsProp),
    [initialOptionsProp, optionsProp]
  );

  // Parse the stable key to get options - this reference only changes when content changes
  const initialOptions = useMemo(
    () => JSON.parse(initialOptionsKey) as SelectOption[],
    [initialOptionsKey]
  );

  const [options, setOptions] = useState<SelectOption[]>(initialOptions);
  const [loading, setLoading] = useState(false);
  const [filterValue, setFilterValue] = useState('');

  // Track the internally selected option (from search results)
  const [internalSelectedOption, setInternalSelectedOption] = useState<SelectOption | null>(null);

  // Lazy loading state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Store refs for stable references
  const onSearchRef = useRef(onSearch);
  const onLazyLoadRef = useRef(onLazyLoad);
  const initialOptionsRef = useRef(initialOptions);
  const optionsRef = useRef(options);
  const valueRef = useRef(value);
  const loadingMoreRef = useRef(false);
  const filterValueRef = useRef(filterValue);
  const pageRef = useRef(page);
  const hasMoreRef = useRef(hasMore);

  // Combine prop selectedOption with internally tracked one
  const selectedOption = selectedOptionProp || internalSelectedOption;
  const selectedOptionRef = useRef(selectedOption);

  // Update refs when props/state change
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    onLazyLoadRef.current = onLazyLoad;
  }, [onLazyLoad]);

  useEffect(() => {
    selectedOptionRef.current = selectedOption;
  }, [selectedOption]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    filterValueRef.current = filterValue;
  }, [filterValue]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    initialOptionsRef.current = initialOptions;
    // Only update options if no filter is active
    if (filterValue.trim().length === 0) {
      // Merge with selected option if exists
      const baseOptions = initialOptions;
      if (selectedOptionRef.current && !baseOptions.some(opt => opt.value === selectedOptionRef.current?.value)) {
        setOptions([selectedOptionRef.current, ...baseOptions]);
      } else {
        setOptions(baseOptions);
      }
      // Reset pagination when initial options change
      setPage(1);
      setHasMore(true);
    }
  }, [initialOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const debouncedFilter = useDebounce(filterValue, debounceDelay);

  // Helper to merge selected option with options list
  const mergeSelectedOption = useCallback((optionsList: SelectOption[]): SelectOption[] => {
    const currentSelectedOption = selectedOptionRef.current;
    const currentValue = valueRef.current;
    if (!currentSelectedOption || !currentValue) return optionsList;
    // Check if the selected option is already in the list
    const exists = optionsList.some(opt => opt.value === currentSelectedOption.value);
    if (exists) return optionsList;
    // Add selected option at the beginning
    return [currentSelectedOption, ...optionsList];
  }, []);

  // Fetch options when filter changes - only depends on debouncedFilter
  useEffect(() => {
    const fetchOptions = async () => {
      // Reset pagination on new search
      setPage(1);
      setHasMore(true);

      if (debouncedFilter.trim().length === 0) {
        setOptions(mergeSelectedOption(initialOptionsRef.current));
        return;
      }

      // If lazy load is provided, use it for search with page 1
      if (onLazyLoadRef.current) {
        setLoading(true);
        try {
          const result = await onLazyLoadRef.current(1, debouncedFilter);
          setOptions(mergeSelectedOption(result.options));
          setHasMore(result.hasMore);
        } catch (err) {
          console.error('Error searching:', err);
          setOptions(mergeSelectedOption([]));
          setHasMore(false);
        } finally {
          setLoading(false);
        }
        return;
      }

      // If no onSearch provided, filter locally from initialOptions
      if (!onSearchRef.current) {
        const filtered = initialOptionsRef.current.filter(opt =>
          opt.label.toLowerCase().includes(debouncedFilter.toLowerCase())
        );
        setOptions(mergeSelectedOption(filtered));
        return;
      }

      setLoading(true);
      try {
        const results = await onSearchRef.current(debouncedFilter);
        setOptions(mergeSelectedOption(results));
      } catch (err) {
        console.error('Error searching:', err);
        setOptions(mergeSelectedOption([]));
      } finally {
        setLoading(false);
      }
    };

    fetchOptions();
  }, [debouncedFilter, mergeSelectedOption]);

  // Load more function
  const loadMore = useCallback(async () => {
    if (!onLazyLoadRef.current || loadingMoreRef.current || !hasMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const nextPage = pageRef.current + 1;
      const result = await onLazyLoadRef.current(nextPage, filterValueRef.current);

      // Append new options to existing ones (avoid duplicates)
      setOptions(prev => {
        const existingValues = new Set(prev.map(opt => opt.value));
        const newOptions = result.options.filter(opt => !existingValues.has(opt.value));
        return [...prev, ...newOptions];
      });

      setPage(nextPage);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error('Error loading more:', err);
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, []);

  // Handle panel scroll to detect when to load more
  const handlePanelScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    if (!onLazyLoadRef.current || loadingMoreRef.current || !hasMoreRef.current) return;

    const target = e.target as HTMLElement;
    const { scrollTop, scrollHeight, clientHeight } = target;

    // Load more when scrolled to 80% of the content
    if (scrollTop + clientHeight >= scrollHeight * 0.8) {
      loadMore();
    }
  }, [loadMore]);

  // Handle selection change - capture selected option and clear filter
  const handleChange = useCallback((e: { target: { name: string; value: string } }) => {
    const selectedValue = e.target.value;

    // Find and store the selected option from current options
    if (selectedValue) {
      const found = optionsRef.current.find(opt => opt.value === selectedValue);
      if (found) {
        setInternalSelectedOption(found);
        selectedOptionRef.current = found;
      }
    } else {
      // Value cleared
      setInternalSelectedOption(null);
      selectedOptionRef.current = null;
    }

    setFilterValue(''); // Clear filter on selection
    onChange(e);
  }, [onChange]);

  if (externalLoading) {
    return (
      <div className="w-full">
        <Skeleton height="56px" className="w-full rounded-md" />
      </div>
    );
  }

  // Handle error as boolean or string
  const hasError = typeof error === 'string' ? Boolean(error) : error;
  const errorMessage = typeof error === 'string' ? error : helperText;

  return (
    <FloatLabelDropdown
      ref={ref}
      name={name}
      label={label}
      value={value}
      onChange={handleChange}
      options={options}
      error={hasError}
      helperText={errorMessage}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      filter
      filterPlaceholder="Search..."
      showClear
      loading={loading || loadingMore}
      onFilter={(e) => setFilterValue(e.filter)}
      emptyFilterMessage={loading ? 'Searching...' : 'No results'}
      className="w-full"
      testId={testId}
      onPanelScroll={onLazyLoad ? handlePanelScroll : undefined}
    />
  );
}));

FormSearchableSelect.displayName = 'FormSearchableSelect';

export default FormSearchableSelect;
