import api from './axios';
import type { ApiResponse } from '../types';

export interface IdCardDetail {
  id: string;
  personId: string;
  uniqueCardId: string;
  qrCodeData: string;
  qrCodeDataUrl: string;
  issuedAt: string;
  isActive: boolean;
  person: {
    id: string;
    uniqueId: string;
    fullName: string;
    fatherName: string | null;
    photoUrl: string | null;
    phone: string;
    address: string | null;
    block: { id: string; name: string; district: string };
    ward: { id: string; name: string };
    booth: { id: string; name: string };
  };
}

export interface BulkCardsParams {
  blockId: string;
  wardId?: string;
  boothId?: string;
  autoIssue?: boolean;
}

export interface BulkCardsResponse {
  cards: IdCardDetail[];
  totalMatched: number;
  issuedCount: number;
  skippedCount: number;
}

export const idCardsApi = {
  async issue(personId: string): Promise<IdCardDetail> {
    const res = await api.post<ApiResponse<IdCardDetail>>(
      `/idcards/person/${personId}`,
    );
    return res.data.data;
  },
  async get(personId: string): Promise<IdCardDetail> {
    const res = await api.get<ApiResponse<IdCardDetail>>(
      `/idcards/person/${personId}`,
    );
    return res.data.data;
  },
  async getFull(personId: string): Promise<IdCardDetail> {
    const res = await api.get<ApiResponse<IdCardDetail>>(
      `/idcards/${personId}/full`,
    );
    return res.data.data;
  },
  async bulk(params: BulkCardsParams): Promise<BulkCardsResponse> {
    const res = await api.post<ApiResponse<BulkCardsResponse>>(
      '/idcards/bulk',
      params,
    );
    return res.data.data;
  },
  async revoke(personId: string): Promise<void> {
    await api.delete(`/idcards/person/${personId}`);
  },
};
