/**
 * Prompt Execution Types
 * Types for AI Prompts monitoring and execution tracking
 */

// Dashboard Summary
export interface PromptExecutionSummary {
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  avgResponseTime: number;
  avgAccuracy: number;
}

// Stats by Model
export interface ModelStats {
  model: string;
  calls: number;
  tokens: number;
  cost: number;
  avgResponseTime: number;
  avgAccuracy?: number;
}

// Stats by Use Case
export interface UseCaseStats {
  useCase: string;
  calls: number;
  tokens: number;
  cost: number;
  avgResponseTime: number;
  avgAccuracy?: number;
  percentage?: number;
}

// Hourly Trend Data
export interface HourlyTrend {
  hour: string;
  tokens: number;
  calls: number;
}

// Model Performance Data
export interface ModelPerformance {
  model: string;
  accuracy?: number;
  avgResponseTime: number;
  costPer1kTokens?: number;
  totalCost?: number;
  totalCalls?: number;
  avgTokensPerCall?: number;
  costPerToken?: number;
}

// Cost by Model
export interface CostByModel {
  model: string;
  cost: number;
  percentage: number;
}

// Dashboard Response
export interface PromptExecutionDashboardResponse {
  summary: PromptExecutionSummary;
  byModel: ModelStats[];
  byUseCase: UseCaseStats[];
  trends: HourlyTrend[];
  modelPerformance: ModelPerformance[];
  costByModel: CostByModel[];
  // List data for DataTable (included in dashboard response)
  list?: PromptExecutionRecentCall[];
  totalCount?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  // Pagination object (alternative structure)
  pagination?: {
    total?: number;
    totalItems?: number;
    totalCount?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
  };
}

// Recent Call Item
export interface PromptExecutionRecentCall {
  id: string;
  _id: string;
  timestamp: string;
  model: string;
  useCase: string;
  promptName: string;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  cost: number;
  responseTime: number;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  userId: string;
  accuracy?: number;
  // Extended details (available on get by id)
  promptText?: string;
  responseText?: string;
  caseId?: string;
  promptConstructionRecord?: string;
  finalPrompt?: string;
  promptOutput?: string;
  originalWorkId?: string;
  revision?: number;
  feedbackId?: string;
}

// Prompt Execution Full Record
export interface PromptExecution {
  _id: string;
  id: string;
  promptId: string;
  userId: string;
  promptConstructionRecord?: string;
  finalPrompt?: string;
  promptOutput?: string;
  inputTokenCount?: number;
  outputTokenCount?: number;
  cost?: number;
  executionTime?: number;
  originalWorkId?: string;
  revision?: number;
  feedbackId?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  isDeleted?: boolean;
  // Populated fields
  prompt?: {
    _id: string;
    name: string;
    type: string;
    llm?: string;
  };
  user?: {
    _id: string;
    name: string;
    email: string;
  };
}

// List Response
export interface PromptExecutionListResponse {
  recentCalls: PromptExecutionRecentCall[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Query Params for List
export interface PromptExecutionListParams {
  include_deleted?: boolean;
  prompt_id?: string;
  user_id?: string;
  feedback_id?: string;
  original_work_id?: string;
  min_cost?: number;
  max_cost?: number;
  min_execution_time?: number;
  max_execution_time?: number;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
}

// Query Params for Dashboard
export interface PromptExecutionDashboardParams {
  timeRange?: '1h' | '24h' | '7d';
  llmModel?: string;
  useCase?: string;
  // Pagination for recent calls
  page?: number;
  pageSize?: number;
  // Sorting
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// Query Params for Recent Calls
export interface PromptExecutionRecentCallsParams {
  timeRange?: '1h' | '24h' | '7d' | '30d' | 'custom';
  fromDate?: string;
  toDate?: string;
  llmModel?: string;
  useCase?: string;
  page?: number;
  pageSize?: number;
}

// Create Request
export interface PromptExecutionCreateRequest {
  promptId: string;
  userId: string;
  promptConstructionRecord?: string;
  finalPrompt?: string;
  promptOutput?: string;
  inputTokenCount?: number;
  outputTokenCount?: number;
  cost?: number;
  executionTime?: number;
  originalWorkId?: string;
  revision?: number;
  feedbackId?: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

// Time Range Options
export type TimeRangeOption = {
  label: string;
  value: '1h' | '24h' | '7d';
};

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { label: 'Last hour', value: '1h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
];

// Model Options for filtering
export const LLM_MODEL_OPTIONS = [
  { label: 'All Models', value: '' },
  { label: 'GPT-4', value: 'gpt-4' },
  { label: 'Claude-3', value: 'claude-3' },
  { label: 'Gemini-Pro', value: 'gemini-pro' },
  { label: 'Llama-2', value: 'llama-2' },
];

// Model color mapping
export const MODEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'gpt-4': { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-600 dark:text-green-400', border: 'border-green-500' },
  'GPT-4': { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-600 dark:text-green-400', border: 'border-green-500' },
  'claude-3': { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500' },
  'Claude-3': { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500' },
  'gemini-pro': { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500' },
  'Gemini-Pro': { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500' },
  'llama-2': { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500' },
  'Llama-2': { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500' },
};

export const getModelColors = (model: string) => {
  return MODEL_COLORS[model] || { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-500' };
};

// Status color mapping
export const getStatusSeverity = (status: string): 'success' | 'danger' | 'warning' | 'info' => {
  switch (status.toUpperCase()) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'PENDING':
      return 'warning';
    default:
      return 'info';
  }
};

// Accuracy color helper
export const getAccuracyColor = (accuracy: number | null | undefined): string => {
  if (accuracy == null) return 'text-gray-600 dark:text-gray-400';
  if (accuracy >= 95) return 'text-green-600 dark:text-green-400';
  if (accuracy >= 90) return 'text-blue-600 dark:text-blue-400';
  if (accuracy >= 85) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
};

// Format helpers
export const formatTokenCount = (count: number | null | undefined): string => {
  if (count == null) return '0';
  if (count >= 1000000) return `${(count / 1000000).toFixed(2)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount == null) return '$0.00';
  return `$${amount.toFixed(amount < 1 ? 4 : 2)}`;
};

export const formatResponseTime = (seconds: number | null | undefined): string => {
  if (seconds == null) return '0.0s';
  return `${seconds.toFixed(1)}s`;
};
