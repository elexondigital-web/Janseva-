import api from './axios';
import type { ApiResponse, PartyRole, Status } from '../types';

export interface DashboardTotals {
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  pendingMembers: number;
  newThisMonth: number;
  newLast30Days: number;
  withIdCard: number;
  totalBlocks: number;
  totalWards: number;
  totalBooths: number;
}

export interface RecentMember {
  id: string;
  uniqueId: string;
  fullName: string;
  phone: string;
  photoUrl: string | null;
  role: PartyRole;
  status: Status;
  createdAt: string;
  block: { name: string } | null;
  ward: { name: string } | null;
  booth: { name: string } | null;
}

export interface TopBlock {
  id: string;
  name: string;
  district: string;
  count: number;
}

export interface DashboardStats {
  totals: DashboardTotals;
  byGender: { label: string; value: number }[];
  byRole: { label: string; value: number }[];
  byStatus: { label: string; value: number }[];
  recentMembers: RecentMember[];
  topBlocks: TopBlock[];
}

export const dashboardApi = {
  async getStats(): Promise<DashboardStats> {
    const res = await api.get<ApiResponse<DashboardStats>>('/dashboard/stats');
    return res.data.data;
  },
};
