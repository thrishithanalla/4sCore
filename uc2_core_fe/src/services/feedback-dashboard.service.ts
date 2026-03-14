import { api } from './api';

// Feedback Dashboard Search Params
export interface FeedbackDashboardParams {
  timeRange?: '1h' | '24h' | '7d' | '30d' | '90d' | 'custom' | 'all';
  startDate?: string;
  endDate?: string;
  granularity?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  componentType?: string;
  moduleId?: string;
  unitId?: string;
  personnelId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// Feedback Dashboard Response Types
export interface FeedbackDashboardResponse {
  success: boolean;
  code: number;
  message: string;
  data: FeedbackDashboardData;
}

export interface FeedbackDashboardData {
  summary: FeedbackSummary;
  trends: FeedbackTrend[];
  byModule: FeedbackByModule[];
  byCategory: FeedbackByCategory[];
  recentFeedback: RecentFeedbackItem[];
  pagination: PaginationInfo;
}

export interface FeedbackSummary {
  totalFeedback: number;
  likedCount: number;
  dislikedCount: number;
  neutralCount: number;
  averageRating: number;
  likePercentage: number;
  dislikePercentage: number;
}

export interface FeedbackTrend {
  period: string;
  positive: number;
  negative: number;
  neutral: number;
  total: number;
}

export interface FeedbackByModule {
  moduleId: string;
  moduleName: string;
  count: number;
  positive: number;
  negative: number;
  neutral: number;
}

export interface FeedbackByCategory {
  category: string;
  count: number;
  percentage: number;
}

export interface RecentFeedbackItem {
  id: string;
  time: string;
  user: {
    name: string;
    department: string;
  };
  module: string;
  category: string;
  subject: string;
  rating: 'positive' | 'negative' | 'neutral';
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  status: 'ACKNOWLEDGED' | 'IN PROGRESS' | 'PLANNED' | 'RESOLVED';
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export const feedbackDashboardService = {
  // Get feedback dashboard data with filters
  getDashboardData: async (params?: FeedbackDashboardParams): Promise<FeedbackDashboardResponse> => {
    const response = await api.get<FeedbackDashboardResponse>('/api/v1/feedback-dashboard', { params });
    return response.data;
  },

  // Export feedbacks as Excel file
  export: async (): Promise<Blob> => {
    const response = await api.get('/api/v1/feedbacks/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};
