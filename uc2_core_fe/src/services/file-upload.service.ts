import axios from 'axios';
import type {
  FileUploadSearchParams,
  FileUploadSearchResponse,
  FileUpload,
} from '../types/file-upload.types';

// Create axios instance for file upload API
const fileApi = axios.create({
  baseURL: import.meta.env.VITE_FILE_UPLOAD_API || 'https://devapi.ai4andhrapolice.com/core-fileupload',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth interceptor
fileApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const fileUploadService = {
  // List files with pagination (requires district param)
  search: async (params?: FileUploadSearchParams): Promise<FileUploadSearchResponse> => {
    // API expects: district (required), limit (1-1000, default 20), skip (default 0)
    // Also supports: search, category, status, fromDate, toDate filters
    const apiParams: Record<string, any> = {
      district: params?.district, // District ID
      limit: params?.page_size || 20,
      skip: ((params?.page || 1) - 1) * (params?.page_size || 20),
    };

    // Add optional filter parameters
    if (params?.search) {
      apiParams.search = params.search;
    }
    if (params?.category) {
      apiParams.category = params.category;
    }
    if (params?.status) {
      apiParams.status = params.status;
    }
    if (params?.fromDate) {
      apiParams.fromDate = params.fromDate;
    }
    if (params?.toDate) {
      apiParams.toDate = params.toDate;
    }
    if (params?.module) {
      apiParams.module = params.module;
    }
    if (params?.uploadedBy) {
      apiParams.uploadedBy = params.uploadedBy;
    }

    console.log('[FileUpload] API Request params:', apiParams);
    const response = await fileApi.get('/api/v1/files/list', { params: apiParams });
    console.log('[FileUpload] API Response:', response.data);

    // Transform response to match our expected format
    const data = response.data;
    const items = data.data?.files || [];
    const pagination = data.data?.pagination || {};
    const total = pagination.total || items.length;
    console.log('[FileUpload] Parsed items:', items.length, 'total:', total);

    return {
      success: true,
      code: 200,
      message: 'Success',
      data: {
        items: items.map((file: any) => ({
          _id: file._id,
          originalName: file.fileName || '',
          fileName: file.encryptedName || file.fileName || '',
          mimeType: file.contentType || 'application/octet-stream',
          size: file.fileSize || 0,
          path: file.filePath || '',
          url: file.url || '',
          module: file.module || 'core',
          uploadedBy: file.uploadedBy || '',
          uploadedByName: file.uploadedByName || '',
          district: file.district || '',
          status: file.status || 'completed',
          category: getCategoryFromMimeType(file.contentType),
          metadata: file.metadata || {},
          tags: file.tags || [],
          isDelete: file.isDelete || false,
          createdAt: file.uploadedAt || new Date().toISOString(),
          updatedAt: file.updatedAt || '',
        })),
        page: pagination.page || params?.page || 1,
        page_size: pagination.limit || params?.page_size || 20,
        total: total,
        total_pages: pagination.totalPages || Math.ceil(total / (params?.page_size || 20)),
      },
    };
  },

  // Get file by ID
  getById: async (id: string): Promise<{ success: boolean; data: FileUpload }> => {
    const response = await fileApi.get(`/api/v1/files/get/${id}`);
    const file = response.data.data || response.data;
    return {
      success: true,
      data: {
        _id: file._id || file.id,
        originalName: file.originalName || file.filename || file.name,
        fileName: file.fileName || file.blobName || file.name,
        mimeType: file.mimeType || file.contentType || 'application/octet-stream',
        size: file.size || file.fileSize || 0,
        path: file.path || file.blobName,
        url: file.url,
        module: file.module || file.district || 'core',
        uploadedBy: file.uploadedBy || '',
        uploadedByName: file.uploadedByName || file.uploadedBy || '',
        district: file.district || '',
        status: file.status || 'completed',
        category: getCategoryFromMimeType(file.mimeType || file.contentType),
        metadata: file.metadata || {},
        tags: file.tags || [],
        isDelete: file.isDelete || false,
        createdAt: file.createdAt || file.uploadedAt || new Date().toISOString(),
        updatedAt: file.updatedAt,
      },
    };
  },

  // Search files by SHA-256 hash
  searchByHash: async (sha256: string): Promise<{ success: boolean; data: FileUpload[] }> => {
    const response = await fileApi.get('/api/v1/files/search', { params: { sha256 } });
    return response.data;
  },

  // Delete file (soft delete)
  delete: async (id: string): Promise<{ success: boolean; message: string }> => {
    const response = await fileApi.delete(`/api/v1/files/delete/${id}`);
    return response.data;
  },

  // Get download URL for file
  getDownloadUrl: async (id: string, inline?: boolean): Promise<string> => {
    const response = await fileApi.get(`/api/v1/files/download/${id}`, {
      params: { inline },
    });
    return response.data.url || response.data.downloadUrl;
  },

  // Download file as blob
  download: async (id: string): Promise<Blob> => {
    // First get the download URL
    const downloadUrlResponse = await fileApi.get(`/api/v1/files/download/${id}`);
    const downloadUrl = downloadUrlResponse.data.url || downloadUrlResponse.data.downloadUrl;

    // Then fetch the actual file
    const response = await axios.get(downloadUrl, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Stream file (for encrypted files)
  getStreamUrl: (id: string, inline?: boolean): string => {
    const baseUrl = import.meta.env.VITE_FILE_UPLOAD_API || 'https://devapi.ai4andhrapolice.com/core-fileupload';
    return `${baseUrl}/api/v1/files/file-download/${id}${inline ? '?inline=true' : ''}`;
  },

  // Get file preview URL (requires authentication)
  getPreviewUrl: (id: string): string => {
    const baseUrl = import.meta.env.VITE_FILE_UPLOAD_API || 'https://devapi.ai4andhrapolice.com/core-fileupload';
    return `${baseUrl}/api/v1/files/file-download/${id}?inline=true`;
  },

  // Get file URL with authentication (for displaying images inline)
  // When inline=true, API returns the file binary data - convert to blob URL
  getFileUrl: async (id: string): Promise<string> => {
    const response = await fileApi.get(`/api/v1/files/file-download/${id}`, {
      params: { inline: true },
      responseType: 'blob',
    });
    // Create a blob URL from the binary response
    const blobUrl = URL.createObjectURL(response.data);
    console.log('Created blob URL:', blobUrl);
    return blobUrl;
  },

  // Upload file
  upload: async (
    file: File,
    options: {
      district: string;
      uploadedBy: string;
      module: string;
      encrypt?: boolean;
      uploadType?: string;
    }
  ): Promise<{ success: boolean; data: { fileId: string } }> => {
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {
      'Content-Type': 'multipart/form-data',
      district: options.district,
      uploadedBy: options.uploadedBy,
      module: options.module,
    };
    if (options.uploadType) {
      headers.uploadType = options.uploadType;
    }

    const response = await fileApi.post('/api/v1/files/upload', formData, {
      params: { encrypt: options.encrypt },
      headers,
    });
    return response.data;
  },

  // Check Azure connectivity
  checkAzure: async (): Promise<{ success: boolean; message: string }> => {
    const response = await fileApi.get('/check/azure');
    return response.data;
  },

  // Health check
  healthCheck: async (): Promise<{ status: string }> => {
    const response = await fileApi.get('/health');
    return response.data;
  },

  // Format file size
  formatFileSize: (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  },

  // Get file icon based on mime type
  getFileIcon: (mimeType: string): string => {
    if (!mimeType) return 'pi pi-file';
    if (mimeType.startsWith('image/')) return 'pi pi-image';
    if (mimeType.startsWith('video/')) return 'pi pi-video';
    if (mimeType.startsWith('audio/')) return 'pi pi-volume-up';
    if (mimeType.includes('pdf')) return 'pi pi-file-pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'pi pi-file-word';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'pi pi-file-excel';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'pi pi-file';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('compressed')) return 'pi pi-file-zip';
    if (mimeType.includes('text')) return 'pi pi-file-edit';
    return 'pi pi-file';
  },

  // Get category color
  getCategoryColor: (category: string): { bg: string; text: string } => {
    switch (category) {
      case 'image':
        return { bg: '#dbeafe', text: '#1e40af' };
      case 'video':
        return { bg: '#f3e8ff', text: '#7c3aed' };
      case 'audio':
        return { bg: '#fef3c7', text: '#92400e' };
      case 'document':
        return { bg: '#dcfce7', text: '#166534' };
      default:
        return { bg: '#f3f4f6', text: '#374151' };
    }
  },
};

// Helper function to get category from mime type
function getCategoryFromMimeType(mimeType: string): 'image' | 'video' | 'audio' | 'document' | 'other' {
  if (!mimeType) return 'other';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('word') ||
    mimeType.includes('document') ||
    mimeType.includes('excel') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('text') ||
    mimeType.includes('powerpoint')
  ) {
    return 'document';
  }
  return 'other';
}
