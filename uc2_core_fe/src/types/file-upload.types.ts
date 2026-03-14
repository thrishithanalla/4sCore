// File Upload Types

export type FileStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type FileCategory = 'document' | 'image' | 'video' | 'audio' | 'other';

export interface FileUpload {
  _id: string;
  id?: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  path?: string;
  url?: string;
  module: string;
  uploadedBy: string;
  uploadedByName?: string;
  district?: string;
  status: FileStatus;
  category: FileCategory;
  metadata?: Record<string, any>;
  tags?: string[];
  isDelete?: boolean;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface FileUploadStats {
  total: number;
  totalSize: number;
  byCategory: {
    category: FileCategory;
    count: number;
    size: number;
  }[];
  byModule: {
    module: string;
    count: number;
    size: number;
  }[];
  byStatus: {
    status: FileStatus;
    count: number;
  }[];
}

export interface FileUploadSearchParams {
  search?: string;
  district?: string;  // Required for file list API
  module?: string;
  category?: FileCategory;
  status?: FileStatus;
  uploadedBy?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  page_size?: number;
}

export interface FileUploadSearchResponse {
  success: boolean;
  code: number;
  message: string;
  data: {
    items: FileUpload[];
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface FileUploadStatsResponse {
  success: boolean;
  code: number;
  message: string;
  data: FileUploadStats;
}
