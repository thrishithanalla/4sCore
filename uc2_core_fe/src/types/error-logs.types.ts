/**
 * Error Logs Monitor Types
 * Extended types for the Error Logs Monitor page
 */

// Re-export core types from index
export type {
  ErrorLog,
  ErrorLogSearchParams,
  ErrorLogSearchResponse,
  ErrorLogDashboardResponse,
  ErrorLogDashboardStats,
  ErrorLogSummary,
  ErrorLogTypeStats,
  ErrorLogSeverityStats,
  ErrorLogTrend,
  ErrorLogImpact,
  ErrorGroup,
} from './index';

// Error Severity type
export type ErrorSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

// Source types for errors
export type SourceType = 'API' | 'SCREEN' | 'FUNCTION' | 'THIRDPARTY' | 'UI';

// Status types
export type ErrorStatus = 'UNRESOLVED' | 'INVESTIGATING' | 'MONITORING' | 'RESOLVED';

// Time range options
export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d' | 'all';

// Filter state for error logs monitor
export interface ErrorLogsFilterState {
  timeRange: TimeRange;
  errorType?: SourceType;
  severity?: ErrorSeverity;
  status?: ErrorStatus;
  search?: string;
}

// Stats card configuration
export interface StatsCardConfig {
  id: string;
  label: string;
  icon: string;
  bgColor: string;
  iconBgColor: string;
  textColor: string;
  borderColor: string;
}
