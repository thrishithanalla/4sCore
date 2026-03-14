import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function uploadFile(file: File, options?: { headers?: Record<string, string> }): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await axios.post(`${API_BASE}/api/v1/files/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
      ...options?.headers,
    },
  });
  return response.data;
}

export async function downloadFile(fileId: string): Promise<Blob> {
  const response = await axios.get(`${API_BASE}/api/v1/files/${fileId}/download`, {
    responseType: 'blob',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
    },
  });
  return response.data;
}

export function getDownloadUrl(fileId: string): string {
  return `${API_BASE}/api/v1/files/${fileId}/download`;
}
