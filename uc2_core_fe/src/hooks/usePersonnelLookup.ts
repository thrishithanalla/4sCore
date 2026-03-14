/**
 * usePersonnelLookup Hook
 * Provides easy access to personnel name lookups with caching
 * Perfect for showing createdBy/updatedBy names in view pages
 */

import { useState, useEffect, useCallback } from 'react';
import { personnelLookupService, type PersonnelMinimal } from '../services/personnel-lookup.service';

/**
 * Hook to get a single personnel name by ID
 * Automatically fetches and caches the data
 */
export function usePersonnelName(id: string | null | undefined): {
  name: string;
  loading: boolean;
} {
  const [name, setName] = useState<string>('-');
  const [loading, setLoading] = useState<boolean>(!!id);

  useEffect(() => {
    if (!id) {
      setName('-');
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    personnelLookupService.getNameById(id).then((result) => {
      if (mounted) {
        setName(result);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [id]);

  return { name, loading };
}

/**
 * Hook to get multiple personnel names by IDs
 * Returns a lookup function and loading state
 */
export function usePersonnelNames(ids: (string | null | undefined)[]): {
  names: Map<string, string>;
  loading: boolean;
  getName: (id: string | null | undefined) => string;
} {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState<boolean>(ids.some((id) => !!id));

  useEffect(() => {
    const validIds = ids.filter((id): id is string => !!id);
    if (validIds.length === 0) {
      setNames(new Map());
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    personnelLookupService.getNamesByIds(validIds).then((result) => {
      if (mounted) {
        setNames(result);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [JSON.stringify(ids)]); // eslint-disable-line react-hooks/exhaustive-deps

  const getName = useCallback(
    (id: string | null | undefined): string => {
      if (!id) return '-';
      return names.get(id) || id;
    },
    [names]
  );

  return { names, loading, getName };
}

/**
 * Hook to get createdBy and updatedBy names
 * Convenient for view pages
 */
export function useAuditNames(
  createdBy: string | null | undefined,
  updatedBy: string | null | undefined
): {
  createdByName: string;
  updatedByName: string;
  loading: boolean;
} {
  const [createdByName, setCreatedByName] = useState<string>('-');
  const [updatedByName, setUpdatedByName] = useState<string>('-');
  const [loading, setLoading] = useState<boolean>(!!createdBy || !!updatedBy);

  useEffect(() => {
    const ids = [createdBy, updatedBy].filter((id): id is string => !!id);
    if (ids.length === 0) {
      setCreatedByName('-');
      setUpdatedByName('-');
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    personnelLookupService.getNamesByIds(ids).then((result) => {
      if (mounted) {
        setCreatedByName(createdBy ? result.get(createdBy) || '-' : '-');
        setUpdatedByName(updatedBy ? result.get(updatedBy) || '-' : '-');
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [createdBy, updatedBy]);

  return { createdByName, updatedByName, loading };
}

/**
 * Hook to get all personnel for dropdowns
 * Uses cached data
 */
export function usePersonnelList(): {
  personnel: PersonnelMinimal[];
  loading: boolean;
  refresh: () => void;
} {
  const [personnel, setPersonnel] = useState<PersonnelMinimal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchPersonnel = useCallback(async () => {
    setLoading(true);
    try {
      const data = await personnelLookupService.getAll();
      setPersonnel(data);
    } catch (error) {
      console.error('Failed to fetch personnel list:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersonnel();
  }, [fetchPersonnel]);

  const refresh = useCallback(() => {
    personnelLookupService.clearCache();
    fetchPersonnel();
  }, [fetchPersonnel]);

  return { personnel, loading, refresh };
}

export default usePersonnelName;
