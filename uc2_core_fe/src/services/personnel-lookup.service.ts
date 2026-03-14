/**
 * Personnel Lookup Service with Caching
 * Provides efficient lookup of personnel names for createdBy/updatedBy fields
 * Uses the minimal list endpoint and caches data in memory
 */

import { api } from './api';

// Type for minimal personnel data
export interface PersonnelMinimal {
  _id: string;
  userId: string;
  name: string;
}

// API Response type
interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

// Cache configuration
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache

// Cache storage
let personnelCache: Map<string, PersonnelMinimal> | null = null;
let cacheTimestamp: number = 0;
let fetchPromise: Promise<Map<string, PersonnelMinimal>> | null = null;

/**
 * Fetch personnel minimal list from API
 */
const fetchPersonnelMinimalList = async (): Promise<PersonnelMinimal[]> => {
  const response = await api.get<ApiResponse<PersonnelMinimal[]>>(
    '/api/v1/personnel-master/list-minimal'
  );
  return response.data.data || [];
};

/**
 * Build cache map from personnel list
 */
const buildCacheMap = (personnelList: PersonnelMinimal[]): Map<string, PersonnelMinimal> => {
  const map = new Map<string, PersonnelMinimal>();
  personnelList.forEach((person) => {
    map.set(person._id, person);
    // Also map by userId for flexibility
    if (person.userId) {
      map.set(person.userId, person);
    }
  });
  return map;
};

/**
 * Check if cache is valid
 */
const isCacheValid = (): boolean => {
  return personnelCache !== null && Date.now() - cacheTimestamp < CACHE_TTL;
};

/**
 * Get or fetch the personnel cache
 * Uses promise deduplication to avoid multiple concurrent fetches
 */
const getOrFetchCache = async (): Promise<Map<string, PersonnelMinimal>> => {
  // Return cached data if valid
  if (isCacheValid() && personnelCache) {
    return personnelCache;
  }

  // If a fetch is already in progress, wait for it
  if (fetchPromise) {
    return fetchPromise;
  }

  // Start new fetch
  fetchPromise = (async () => {
    try {
      const list = await fetchPersonnelMinimalList();
      personnelCache = buildCacheMap(list);
      cacheTimestamp = Date.now();
      console.log(`📋 Personnel cache loaded: ${list.length} entries`);
      return personnelCache;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
};

/**
 * Personnel Lookup Service
 */
export const personnelLookupService = {
  /**
   * Get personnel name by ID
   * Returns the name or a fallback value
   */
  getNameById: async (id: string | null | undefined): Promise<string> => {
    if (!id) return '-';

    try {
      const cache = await getOrFetchCache();
      const person = cache.get(id);
      return person?.name || id; // Return ID if not found
    } catch (error) {
      console.error('Failed to lookup personnel:', error);
      return id; // Return ID on error
    }
  },

  /**
   * Get personnel by ID
   * Returns the full minimal personnel object or null
   */
  getById: async (id: string | null | undefined): Promise<PersonnelMinimal | null> => {
    if (!id) return null;

    try {
      const cache = await getOrFetchCache();
      return cache.get(id) || null;
    } catch (error) {
      console.error('Failed to lookup personnel:', error);
      return null;
    }
  },

  /**
   * Get multiple personnel names by IDs
   * Returns a map of ID -> name
   */
  getNamesByIds: async (ids: (string | null | undefined)[]): Promise<Map<string, string>> => {
    const result = new Map<string, string>();
    const validIds = ids.filter((id): id is string => !!id);

    if (validIds.length === 0) return result;

    try {
      const cache = await getOrFetchCache();
      validIds.forEach((id) => {
        const person = cache.get(id);
        result.set(id, person?.name || id);
      });
    } catch (error) {
      console.error('Failed to lookup personnel:', error);
      validIds.forEach((id) => result.set(id, id));
    }

    return result;
  },

  /**
   * Preload the cache
   * Call this early in app initialization for better UX
   */
  preload: async (): Promise<void> => {
    try {
      await getOrFetchCache();
    } catch (error) {
      console.error('Failed to preload personnel cache:', error);
    }
  },

  /**
   * Clear the cache
   * Call this after creating/updating personnel
   */
  clearCache: (): void => {
    personnelCache = null;
    cacheTimestamp = 0;
    fetchPromise = null;
    console.log('📋 Personnel cache cleared');
  },

  /**
   * Get all cached personnel (for dropdowns etc.)
   * Returns array of all personnel
   */
  getAll: async (): Promise<PersonnelMinimal[]> => {
    try {
      const cache = await getOrFetchCache();
      // Convert map to array, removing duplicates (userId entries)
      const seen = new Set<string>();
      const result: PersonnelMinimal[] = [];
      cache.forEach((person) => {
        if (!seen.has(person._id)) {
          seen.add(person._id);
          result.push(person);
        }
      });
      return result;
    } catch (error) {
      console.error('Failed to get all personnel:', error);
      return [];
    }
  },
};

export default personnelLookupService;
