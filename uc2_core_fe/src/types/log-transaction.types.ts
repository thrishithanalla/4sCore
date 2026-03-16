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
