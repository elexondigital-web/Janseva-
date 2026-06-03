import api from './axios';
import type { ApiResponse } from '../types';

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimetype: string;
}

export const uploadsApi = {
  async upload(file: File, folder: 'photos' | 'aadhaar' | 'misc' = 'misc'): Promise<UploadResult> {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<ApiResponse<UploadResult>>(
      `/uploads?folder=${folder}`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data.data;
  },
};
