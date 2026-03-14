/**
 * useOrgStructure Hook
 *
 * React Query hook for fetching organizational structure data from the API.
 *
 * Usage:
 * ```tsx
 * const { data, isLoading, error, refetch } = useOrgStructure({
 *   format: 'tree',
 *   unitId: '123',
 *   includeInactive: false
 * });
 * ```
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { api } from '../services/api';
import type { OrgUnit } from '../components/ui/organizational-tree';

export interface OrgStructureParams {
  /** Response format: 'tree' (nested) or 'flat' (array) */
  format?: 'tree' | 'flat';
  /** Filter by hierarchy level (L1, L2, etc.) */
  level?: string;
  /** Get subtree starting from specific unit ID */
  unitId?: string;
  /** Filter by district ObjectId */
  districtId?: string;
  /** Filter by unit type ObjectId */
  unitTypeId?: string;
  /** Include inactive units (default: false) */
  includeInactive?: boolean;
}

export interface OrgStructureResponse {
  units: OrgUnit[];
  totalUnits: number;
}

/**
 * Fetch organizational structure from API
 */
const fetchOrgStructure = async (
  params: OrgStructureParams
): Promise<OrgStructureResponse> => {
  const queryParams = new URLSearchParams();

  if (params.format) queryParams.append('format', params.format);
  if (params.level) queryParams.append('level', params.level);
  if (params.unitId) queryParams.append('unitId', params.unitId);
  if (params.districtId) queryParams.append('districtId', params.districtId);
  if (params.unitTypeId) queryParams.append('unitTypeId', params.unitTypeId);
  if (params.includeInactive !== undefined) {
    queryParams.append('includeInactive', String(params.includeInactive));
  }

  const response = await api.get(
    `/api/v1/org-structure?${queryParams.toString()}`
  );

  return response.data.data;
};

/**
 * React Query hook for organizational structure
 */
export const useOrgStructure = (
  params: OrgStructureParams = {},
  options?: Omit<
    UseQueryOptions<OrgStructureResponse, Error>,
    'queryKey' | 'queryFn'
  >
) => {
  return useQuery<OrgStructureResponse, Error>({
    queryKey: ['org-structure', params],
    queryFn: () => fetchOrgStructure(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (cacheTime is now gcTime in React Query v5)
    ...options,
  });
};

/**
 * Get specific unit details by ID
 */
export const useUnitDetails = (
  unitId: string,
  options?: Omit<UseQueryOptions<OrgUnit, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery<OrgUnit, Error>({
    queryKey: ['unit-details', unitId],
    queryFn: async () => {
      const response = await api.get(`/units/${unitId}`);
      return response.data.data;
    },
    enabled: !!unitId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
};

export default useOrgStructure;
