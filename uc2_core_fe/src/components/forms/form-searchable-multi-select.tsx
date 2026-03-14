import { useState, useEffect, memo, forwardRef } from 'react';
import { Skeleton } from 'primereact/skeleton';
import { FloatLabelMultiSelect, SelectOption } from 'mainFe/FloatLabelMultiSelect';
import { useDebounce } from '../../hooks/useDebounce';

export type { SelectOption };

interface FormSearchableMultiSelectProps {
  name: string;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  onSearch: (searchTerm: string) => Promise<SelectOption[]>;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  debounceDelay?: number;
  initialOptions?: SelectOption[];
  loading?: boolean;
}

const FormSearchableMultiSelect = memo(forwardRef<HTMLDivElement, FormSearchableMultiSelectProps>(({
  name,
  label,
  value,
  onChange,
  onSearch,
  error = false,
  helperText = '',
  disabled = false,
  required = false,
  placeholder = 'Search',
  debounceDelay = 500,
  initialOptions = [],
  loading: externalLoading = false,
}, ref) => {
  const [options, setOptions] = useState<SelectOption[]>(initialOptions);
  const [loading, setLoading] = useState(false);
  const [filterValue, setFilterValue] = useState('');

  const debouncedFilter = useDebounce(filterValue, debounceDelay);

  // Fetch options when filter changes
  useEffect(() => {
    const fetchOptions = async () => {
      if (debouncedFilter.trim().length === 0) {
        setOptions(initialOptions);
        return;
      }

      setLoading(true);
      try {
        const results = await onSearch(debouncedFilter);
        setOptions(results);
      } catch (err) {
        console.error('Error searching:', err);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOptions();
  }, [debouncedFilter, onSearch, initialOptions]);

  if (externalLoading) {
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
      options={options}
      error={error}
      helperText={helperText}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      filter
      filterPlaceholder="Search..."
      showClear
      loading={loading}
      onFilter={(e) => setFilterValue(e.filter)}
      display="chip"
      className="w-full"
      testId={`${name}-multiselect`}
    />
  );
}));

FormSearchableMultiSelect.displayName = 'FormSearchableMultiSelect';

export default FormSearchableMultiSelect;
