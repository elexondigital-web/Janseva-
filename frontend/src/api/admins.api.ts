import api from './axios';
import type { ApiResponse, AdminRole } from '../types';

export interface AdminRecord {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  blockId: string | null;
  wardId: string | null;
  boothId: string | null;
  block: { id: string; name: string; district: string } | null;
  ward: { id: string; name: string } | null;
  booth: { id: string; name: string } | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  loginCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListAdminsResponse {
  items: AdminRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminStats {
  total: number;
  active: number;
  inactive: number;
  byRole: Record<AdminRole, number>;
}

export interface CreateAdminPayload {
  name: string;
  email: string;
  password?: string;
  role: AdminRole;
  blockId?: string;
  wardId?: string;
  boothId?: string;
  sendEmail?: boolean;
}

export interface UpdateAdminPayload {
  name?: string;
  role?: AdminRole;
  blockId?: string | null;
  wardId?: string | null;
  boothId?: string | null;
  isActive?: boolean;
}

export interface CreateAdminResult {
  admin: AdminRecord;
  tempPassword?: string;
  emailSent: boolean;
}

export interface ResetPasswordResult {
  id: string;
  tempPassword: string;
  emailSent: boolean;
}

export const adminsApi = {
  async list(
    params: { blockId?: string; role?: AdminRole; page?: number; limit?: number } = {},
  ): Promise<ListAdminsResponse> {
    const res = await api.get<ApiResponse<ListAdminsResponse>>('/admins', {
      params,
    });
    return res.data.data;
  },
  async stats(): Promise<AdminStats> {
    const res = await api.get<ApiResponse<AdminStats>>('/admins/stats');
    return res.data.data;
  },
  async get(id: string): Promise<AdminRecord> {
    const res = await api.get<ApiResponse<AdminRecord>>(`/admins/${id}`);
    return res.data.data;
  },
  async create(payload: CreateAdminPayload): Promise<CreateAdminResult> {
    const res = await api.post<ApiResponse<CreateAdminResult>>(
      '/admins',
      payload,
    );
    return res.data.data;
  },
  async update(
    id: string,
    payload: UpdateAdminPayload,
  ): Promise<AdminRecord> {
    const res = await api.patch<ApiResponse<AdminRecord>>(
      `/admins/${id}`,
      payload,
    );
    return res.data.data;
  },
  async deactivate(id: string): Promise<{ id: string; deactivated: true }> {
    const res = await api.delete<ApiResponse<{ id: string; deactivated: true }>>(
      `/admins/${id}`,
    );
    return res.data.data;
  },
  async resetPassword(id: string): Promise<ResetPasswordResult> {
    const res = await api.post<ApiResponse<ResetPasswordResult>>(
      `/admins/${id}/reset-password`,
    );
    return res.data.data;
  },
};
