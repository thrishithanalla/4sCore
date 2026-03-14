// Log Transaction Types

export type LogLevel = 'info' | 'warning' | 'error';
export type LogLayer = 'screen' | 'function' | 'api' | 'config';

export interface LogTransactionMetadata {
  [key: string]: string | number | boolean | null | undefined;
}

export interface LogTransaction {
  _id: string;
  id?: string;
  templateId: string;
  logCode?: string;
  level: LogLevel;
  layer: LogLayer;
  actorId?: string;
  actorName?: string;
  endpoint?: string;
  message: string;
  json?: LogTransactionMetadata;
  createdAt: string;
  updatedAt?: string;
  // Populated fields
  template?: {
    _id: string;
    name: string;
    moduleId: string;
    module?: {
      _id: string;
      name: string;
    };
  };
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
  level?: LogLevel;
  layer?: LogLayer;
  moduleId?: string;
  logCode?: string;
  actorId?: string;
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
