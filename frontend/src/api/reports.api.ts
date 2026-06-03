import api from './axios';
import type { ApiResponse } from '../types';

export interface OverviewReport {
  totalMembers: number;
  activeMembers: number;
  pendingMembers: number;
  totalWards: number;
  totalBooths: number;
  newThisMonth: number;
  newLastMonth: number;
  growthPercent: number;
  messagesThisMonth: number;
  activeBoothWorkers: number;
  avgAttendancePercent: number;
}

export interface AttendanceTrendItem {
  eventId: string;
  eventName: string;
  date: string;
  attended: number;
  invited: number;
  turnout: number;
}

export interface DemographicsReport {
  gender: { MALE: number; FEMALE: number; OTHER: number };
  age: { '18-35': number; '36-55': number; '55+': number; unknown: number };
  category: { GENERAL: number; OBC: number; SC: number; ST: number };
  status: { ACTIVE: number; INACTIVE: number; PENDING: number };
}

export interface WardPerformanceItem {
  wardId: string;
  wardName: string;
  members: number;
  avgAttendance: number;
  lastEventAttendance: number;
  trend: 'up' | 'down' | 'flat';
}

export interface TopMemberItem {
  personId: string;
  uniqueId: string;
  fullName: string;
  photoUrl: string | null;
  wardName: string | null;
  boothName: string | null;
  attendedEvents: number;
  totalEvents: number;
  attendanceRate: number;
}

export const reportsApi = {
  async overview(blockId?: string): Promise<OverviewReport> {
    const res = await api.get<ApiResponse<OverviewReport>>('/reports/overview', {
      params: blockId ? { blockId } : undefined,
    });
    return res.data.data;
  },
  async attendance(
    blockId?: string,
    limit = 6,
  ): Promise<AttendanceTrendItem[]> {
    const res = await api.get<ApiResponse<AttendanceTrendItem[]>>(
      '/reports/attendance',
      { params: { blockId, limit } },
    );
    return res.data.data;
  },
  async demographics(blockId?: string): Promise<DemographicsReport> {
    const res = await api.get<ApiResponse<DemographicsReport>>(
      '/reports/demographics',
      { params: blockId ? { blockId } : undefined },
    );
    return res.data.data;
  },
  async wardPerformance(blockId?: string): Promise<WardPerformanceItem[]> {
    const res = await api.get<ApiResponse<WardPerformanceItem[]>>(
      '/reports/ward-performance',
      { params: blockId ? { blockId } : undefined },
    );
    return res.data.data;
  },
  async topMembers(blockId?: string, limit = 10): Promise<TopMemberItem[]> {
    const res = await api.get<ApiResponse<TopMemberItem[]>>(
      '/reports/top-members',
      { params: { blockId, limit } },
    );
    return res.data.data;
  },
  /**
   * Streams the PDF as a Blob so the browser can save it. Phase 3
   * server-side render uses pdfkit; the call is identical for the
   * Phase 4 puppeteer upgrade.
   */
  async exportPdf(
    type: 'overview' | 'attendance' | 'demographics',
    blockId?: string,
  ): Promise<Blob> {
    const res = await api.get('/reports/export', {
      params: { type, blockId },
      responseType: 'blob',
    });
    return res.data as Blob;
  },
};
