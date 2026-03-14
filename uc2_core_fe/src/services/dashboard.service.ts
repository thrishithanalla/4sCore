import { api } from './api';

const DASHBOARD_COUNTS_ENDPOINT = '/api/v1/dashboard/counts';

// API response item structure
export interface DashboardCountItem {
  count: number;
  isMenu: boolean;
  route: string | null;
  displayName?: string;  // Optional: display name for the menu item
}

// API response - fully dynamic
export interface DashboardCountsResponse {
  platform: Record<string, DashboardCountItem>;
  application: Record<string, DashboardCountItem>;
}

export const dashboardService = {
  getCounts: async (): Promise<DashboardCountsResponse> => {
    try {
      const response = await api.get<{ data: DashboardCountsResponse }>(DASHBOARD_COUNTS_ENDPOINT);
      return response.data.data || { platform: {}, application: {} };
    } catch (error) {
      console.warn('Failed to fetch dashboard counts:', error);
      return { platform: {}, application: {} };
    }
  },
};