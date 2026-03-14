/* eslint-disable @typescript-eslint/no-explicit-any */
import { api } from './api';
import type { Department, Rank, UnitType, District, Unit, Designation } from '../types';

export const masterService = {
  // Get all departments
  getDepartments: async (): Promise<Department[]> => {
    const response = await api.get<{data:Department[]}>('/api/v1/departments/list?include_deleted=false');
    return response.data.data || [];
  },

  // Get all ranks
  getRanks: async (): Promise<Rank[]> => {
    const response = await api.get<{data:Rank[]}>('/api/v1/ranks/list?include_deleted=false');
    return response.data.data || [];
  },

  // Get all designations
  getDesignations: async (): Promise<Designation[]> => {
    const response = await api.get<{data: Designation[]}>('/api/v1/designation-master/list?include_deleted=false');
    return response.data.data || [];
  },

  // Get all unit types
  getUnitTypes: async (): Promise<UnitType[]> => {
    const response = await api.get<{data: UnitType[]}>('/api/v1/unit-types/list?include_deleted=false');
    return response.data.data || [];
  },

  // Get unit types by department ID
  getUnitTypesByDepartment: async (departmentId: string): Promise<UnitType[]> => {
    const response = await api.get<{data: UnitType[]}>(`/api/v1/unit-types/list?include_deleted=false&departmentId=${departmentId}`);
    return response.data.data || [];
  },

  // Get all districts
  getDistricts: async (): Promise<District[]> => {
    const response = await api.get<{data: District[]}>('/api/v1/districts/list?include_deleted=false');
    return response.data.data || [];
  },

  // Get all units for dropdown using minimal list (no pagination, all units regardless of hierarchy)
  getUnitsForDropdown: async (): Promise<{ _id: string; name: string; unitCode?: string }[]> => {
    const response = await api.get<{ data: { id: string; name: string; unitCode?: string }[] }>('/api/v1/units/list-minimal?include_deleted=false');
    // Map 'id' to '_id' for consistency with other entities
    return (response.data.data || []).map(u => ({ _id: u.id, name: u.name, unitCode: u.unitCode }));
  },

  // Get all units with populated unitType info (includes level for hierarchy filtering)
  getUnitsWithUnitType: async (): Promise<{ id: string; _id: string; name: string; unitType: { id: string; name: string; level: number } | null }[]> => {
    const response = await api.get<{ data: { id: string; name: string; unitType?: { id: string; name: string; level: number } | null }[] }>('/api/v1/units/list-minimal?include_deleted=false');
    // Return with both id and _id for compatibility
    return (response.data.data || []).map(u => ({ ...u, _id: u.id, unitType: u.unitType || null }));
  },

  // Get all personnel/users for dropdown (for responsible/proxy users, with max page size of 100)
  getUsersForDropdown: async (): Promise<{ _id: string; userId: string; name: string; firstName: string; lastName: string; email: string }[]> => {
    const response = await api.get<{ data: any[] }>('/api/v1/personnel-master/list?include_deleted=false');
    return response.data.data || [];
  },

  // Search personnel by search query
  searchPersonnel: async (search: string): Promise<{ _id: string; userId: string; name: string; firstName: string; lastName: string; email: string }[]> => {
    const response = await api.get<{ data: any[] }>(`/api/v1/personnel-master/list?search=${encodeURIComponent(search)}`);
    return response.data.data || [];
  },

  // Get personnel filtered by rank shortCodes
  // API: GET /api/v1/personnel-master/by-ranks?ranks=DGP&ranks=SP
  getPersonnelByRanks: async (rankShortCodes: string[]): Promise<{ _id: string; userId: string; name: string; firstName: string; lastName: string; email: string }[]> => {
    if (!rankShortCodes || rankShortCodes.length === 0) {
      return [];
    }
    // Build query string with multiple ranks params: ranks=DGP&ranks=SP
    const params = new URLSearchParams();
    rankShortCodes.forEach(code => params.append('ranks', code));
    const response = await api.get<{ data: any[] }>(`/api/v1/personnel-master/by-ranks?${params.toString()}`);
    return response.data.data || [];
  },

  // Search personnel by rank shortCodes with search query (client-side filtering)
  searchPersonnelByRanks: async (rankShortCodes: string[], search: string): Promise<{ _id: string; userId: string; name: string; firstName: string; lastName: string; email: string }[]> => {
    if (!rankShortCodes || rankShortCodes.length === 0) {
      return [];
    }
    // Build query string with multiple ranks params
    const params = new URLSearchParams();
    rankShortCodes.forEach(code => params.append('ranks', code));
    const response = await api.get<{ data: any[] }>(`/api/v1/personnel-master/by-ranks?${params.toString()}`);
    const data = response.data.data || [];
    // Client-side search filtering
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      return data.filter((user: any) => {
        const name = user.name || `${user.firstName || ''} ${user.lastName || ''}`;
        return name.toLowerCase().includes(searchLower) ||
               (user.userId && user.userId.toLowerCase().includes(searchLower));
      });
    }
    return data;
  },
};
