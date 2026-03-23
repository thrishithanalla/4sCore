// Log Transaction Types - aligned with new_core_be audit_log schema

export type LogLevel = 'info' | 'warning' | 'error';
export type LogLayer = 'screen' | 'function' | 'api' | 'config' | 'API' | 'Server' | 'db';

export interface LogTransactionMetadata {
  [key: string]: string | number | boolean | null | undefined;
}

export interface LogTransaction {
  _id: string;
  id?: string;
  layer: string;
  eventcode: string;
  EventTimeStamp: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  keyFields?: string;
  parameters?: Record<string, any>;
  retentionPeriod?: number;
  message?: string;
  endpoint?: string;
  entityType?: string;
  entityId?: string;
  orgUnitId?: string;
  requestId?: string;
  Details?: Record<string, any>;
  // Keep for backward compat in UI
  createdAt?: string;
  level?: LogLevel;
  logCode?: string;
}

export interface LogStats {
  total: number;
  infoCount: number;
  warningCount: number;
  errorCount: number;
}

export interface TopError {
  error: string;
  count: number;
  module: string;
  trend: 'up' | 'down' | 'stable';
  affectedUsers: number;
}

export interface ModuleErrorStats {
  name: string;
  errors: number;
  percentage: number;
}

export interface LogVolumeData {
  hour: number;
  count: number;
  percentage: number;
}

export interface LogTransactionSearchParams {
  search?: string;
  layer?: string;
  eventcode?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  orgUnitId?: string;
  endpoint?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  page_size?: number;
}

export interface LogTransactionSearchResponse {
  success: boolean;
  code: number;
  message: string;
  data: {
    items: LogTransaction[];
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface LogTransactionAnalyticsResponse {
  success: boolean;
  code: number;
  message: string;
  data: LogStats;
}

// ---- Dashboard Types ----

export interface AuditOverview {
  totalLogs: number;
  totalTemplates: number;
  todayLogs: number;
  weekLogs: number;
}

export interface LevelBreakdown {
  info: number;
  warning: number;
  error: number;
}

export interface TopUser {
  actorId: string;
  name: string;
  count: number;
}

export interface TopEndpoint {
  endpoint: string;
  count: number;
}

export interface MostRepeatedLog {
  eventcode: string;
  name: string;
  logObject?: string;
  count: number;
}

export interface TemplateHealth {
  total: number;
  activeWithLogs: number;
  activeNoLogs: number;
  inactive: number;
  deleted: number;
}

export interface TopLogModule {
  entityType: string;
  logCount: number;
}

export interface TrendPoint {
  timestamp: string;
  count: number;
}

export interface TrendData {
  lastHour: TrendPoint[];
  last24Hours: TrendPoint[];
  last7Days: TrendPoint[];
  last30Days: TrendPoint[];
}

export interface DashboardData {
  analytics: Record<string, number>;
  trend: TrendData;
  topLogModules: TopLogModule[];
  logs: {
    items: LogTransaction[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  };
  overview: AuditOverview;
  byLevel: LevelBreakdown;
  topUsers: TopUser[];
  topEndpoints: TopEndpoint[];
  mostRepeated: MostRepeatedLog[];
  templateHealth: TemplateHealth;
  allEntityTypes: string[];
}

export interface DashboardResponse {
  success: boolean;
  code: number;
  message: string;
  data: DashboardData;
}

export interface AuditDashboardFilters {
  layer?: string;
  entityType?: string;
  eventcode?: string;
  actorId?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  timeline?: string;
  paramKey?: string;
  paramValue?: string;
  sortField?: string;
  sortOrder?: number;
  tab?: string;
  page?: number;
  page_size?: number;
}

export interface LogTemplate {
  eventCode: string;
  name: string;
  logObject: string;
  logLevel: string;
  isActive: boolean;
  parameters?: { name: string; isKeyField?: boolean; isSensitive?: boolean; label?: string; datatype?: string }[];
}

export interface UserOption {
  actorId: string;
  name: string;
}
