import api from './axios';
import type { ApiResponse } from '../types';

export interface AuditLogRecord {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  blockId: string | null;
  createdAt: string;
}

export interface ListAuditResponse {
  items: AuditLogRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListAuditParams {
  blockId?: string;
  action?: string;
  entity?: string;
  adminId?: string;
  from?: string; // ISO
  to?: string; // ISO
  page?: number;
  limit?: number;
}

export const auditApi = {
  async list(params: ListAuditParams = {}): Promise<ListAuditResponse> {
    const res = await api.get<ApiResponse<ListAuditResponse>>('/audit', {
      params,
    });
    return res.data.data;
  },
};
