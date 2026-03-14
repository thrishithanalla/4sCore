/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useCallback, useEffect } from 'react';

type TrackedValue = any;

/**
 * Deep comparison utility for comparing values including objects, arrays, Sets, and Maps
 */
const deepEqual = (a: TrackedValue, b: TrackedValue): boolean => {
  // Handle null/undefined
  if (a === b) return true;
  if (a == null || b == null) return a === b;

  // Handle Set
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }

  // Handle Map
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key)) return false;
      if (!deepEqual(value, b.get(key))) return false;
    }
    return true;
  }

  // Handle Array
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    // Sort for comparison if all elements are primitives
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => deepEqual(val, sortedB[idx]));
  }

  // Handle Object
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  // Primitives
  return a === b;
};

/**
 * Clone a value deeply, handling Set and Map
 */
const deepClone = (value: TrackedValue): TrackedValue => {
  if (value == null) return value;

  if (value instanceof Set) {
    return new Set(value);
  }

  if (value instanceof Map) {
    const clonedMap = new Map();
    for (const [k, v] of value) {
      clonedMap.set(k, v instanceof Set ? new Set(v) : deepClone(v));
    }
    return clonedMap;
  }

  if (Array.isArray(value)) {
    return [...value];
  }

  if (typeof value === 'object') {
    const cloned: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      cloned[key] = deepClone(value[key]);
    }
    return cloned;
  }

  return value;
};

interface UseFormDirtyTrackerOptions {
  /** Skip dirty checking (useful during initial loading) */
  skip?: boolean;
}

interface UseFormDirtyTrackerReturn {
  /** Whether any tracked value has changed from initial */
  isDirty: boolean;
  /** Set the initial values to compare against. Call this after loading data. */
  setInitialValues: (values: Record<string, TrackedValue>) => void;
  /** Reset dirty state and optionally set new initial values */
  resetDirty: (newInitialValues?: Record<string, TrackedValue>) => void;
  /** Check if form is dirty by comparing current values */
  checkDirty: (currentValues: Record<string, TrackedValue>) => boolean;
}

/**
 * Hook for tracking dirty state in forms that use useState instead of react-hook-form.
 * Handles deep comparison of objects, arrays, Sets, and Maps.
 *
 * @example
 * const { isDirty, setInitialValues, checkDirty } = useFormDirtyTracker();
 *
 * // After loading data
 * useEffect(() => {
 *   if (data) {
 *     setFormData(data);
 *     setInitialValues({ formData: data, selectedItems: new Set() });
 *   }
 * }, [data]);
 *
 * // Track changes
 * useEffect(() => {
 *   checkDirty({ formData, selectedItems });
 * }, [formData, selectedItems]);
 */
export const useFormDirtyTracker = (
  options: UseFormDirtyTrackerOptions = {}
): UseFormDirtyTrackerReturn => {
  const { skip = false } = options;
  const [isDirty, setIsDirty] = useState(false);
  const initialValuesRef = useRef<Record<string, TrackedValue> | null>(null);

  const setInitialValues = useCallback((values: Record<string, TrackedValue>) => {
    // Deep clone to avoid reference issues
    const clonedValues: Record<string, TrackedValue> = {};
    for (const key of Object.keys(values)) {
      clonedValues[key] = deepClone(values[key]);
    }
    initialValuesRef.current = clonedValues;
    setIsDirty(false);
  }, []);

  const resetDirty = useCallback((newInitialValues?: Record<string, TrackedValue>) => {
    if (newInitialValues) {
      setInitialValues(newInitialValues);
    }
    setIsDirty(false);
  }, [setInitialValues]);

  const checkDirty = useCallback(
    (currentValues: Record<string, TrackedValue>): boolean => {
      if (skip || !initialValuesRef.current) {
        return false;
      }

      for (const key of Object.keys(currentValues)) {
        const initial = initialValuesRef.current[key];
        const current = currentValues[key];

        if (!deepEqual(initial, current)) {
          setIsDirty(true);
          return true;
        }
      }

      setIsDirty(false);
      return false;
    },
    [skip]
  );

  return {
    isDirty,
    setInitialValues,
    resetDirty,
    checkDirty,
  };
};

/**
 * Simplified version that auto-tracks changes via useEffect.
 * Pass the values to track and it will automatically update isDirty.
 *
 * @example
 * const { isDirty, setInitialValues } = useFormDirtyTrackerAuto({
 *   formData,
 *   selectedJobs,
 *   selectedPermissions,
 * });
 *
 * // After loading data
 * setInitialValues({ formData: loadedData, selectedJobs: new Set(), selectedPermissions: new Map() });
 */
export const useFormDirtyTrackerAuto = (
  currentValues: Record<string, TrackedValue>,
  options: UseFormDirtyTrackerOptions = {}
): Omit<UseFormDirtyTrackerReturn, 'checkDirty'> => {
  const { isDirty, setInitialValues, resetDirty, checkDirty } = useFormDirtyTracker(options);

  useEffect(() => {
    checkDirty(currentValues);
  }, [currentValues, checkDirty]);

  return {
    isDirty,
    setInitialValues,
    resetDirty,
  };
};

export default useFormDirtyTracker;
