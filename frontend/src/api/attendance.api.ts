import api from './axios';
import type { ApiResponse, AttendanceMethod, EventType } from '../types';

export interface MarkedPerson {
  id: string;
  uniqueId: string;
  fullName: string;
  photoUrl: string | null;
  phone: string;
}

export interface AttendanceRecord {
  id: string;
  personId: string;
  eventId: string;
  markedAt: string;
  method: AttendanceMethod;
}

export interface MarkResult {
  alreadyMarked?: boolean;
  attendance: AttendanceRecord;
  person: MarkedPerson;
}

export interface EventAttendee {
  id: string;
  personId: string;
  eventId: string;
  markedAt: string;
  method: AttendanceMethod;
  person: MarkedPerson & {
    ward: { id: string; name: string } | null;
    booth: { id: string; name: string } | null;
  };
}

export interface ListAttendeesResponse {
  items: EventAttendee[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AttendanceStats {
  event: {
    id: string;
    name: string;
    date: string;
    type: EventType;
  };
  expected: number;
  present: number;
  absent: number;
  percentage: number;
  byMethod: { QR: number; FINGERPRINT: number; MANUAL: number };
  byWard: { wardId: string; wardName: string | null; count: number }[];
  byBooth: { boothId: string; boothName: string | null; count: number }[];
}

export interface PersonAttendanceItem {
  id: string;
  personId: string;
  eventId: string;
  markedAt: string;
  method: AttendanceMethod;
  event: {
    id: string;
    name: string;
    date: string;
    type: EventType;
    location: string | null;
  };
}

export interface ListForPersonResponse {
  items: PersonAttendanceItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const attendanceApi = {
  async markQr(
    eventId: string,
    qrData: string,
  ): Promise<{ data: MarkResult; message: string }> {
    const res = await api.post<
      ApiResponse<MarkResult> & { message: string }
    >('/attendance/qr', { eventId, qrData });
    return { data: res.data.data, message: res.data.message };
  },
  async markManual(
    eventId: string,
    personId: string,
    method?: AttendanceMethod,
  ): Promise<MarkResult> {
    const res = await api.post<ApiResponse<MarkResult>>('/attendance/manual', {
      eventId,
      personId,
      method,
    });
    return res.data.data;
  },
  /**
   * Phase 3: fingerprint marking. The frontend captures from the Mantra
   * RD Service, matches against an enrolled person, then POSTs both the
   * person identifier and the captured template here. Idempotent — same
   * shape as markQr (returns alreadyMarked on duplicate within the event).
   */
  async markFingerprint(
    eventId: string,
    payload: {
      uniqueId?: string;
      personId?: string;
      fingerprintTemplate: string;
    },
  ): Promise<{ data: MarkResult; message: string }> {
    const res = await api.post<
      ApiResponse<MarkResult> & { message: string }
    >('/attendance/fingerprint', { eventId, ...payload });
    return { data: res.data.data, message: res.data.message };
  },
  async unmark(eventId: string, personId: string): Promise<void> {
    await api.delete(`/attendance/event/${eventId}/person/${personId}`);
  },
  async listForEvent(
    eventId: string,
    params: { page?: number; limit?: number } = {},
  ): Promise<ListAttendeesResponse> {
    const res = await api.get<ApiResponse<ListAttendeesResponse>>(
      `/attendance/event/${eventId}`,
      { params },
    );
    return res.data.data;
  },
  async stats(eventId: string): Promise<AttendanceStats> {
    const res = await api.get<ApiResponse<AttendanceStats>>(
      `/attendance/stats/${eventId}`,
    );
    return res.data.data;
  },
  async listForPerson(
    personId: string,
    params: { page?: number; limit?: number } = {},
  ): Promise<ListForPersonResponse> {
    const res = await api.get<ApiResponse<ListForPersonResponse>>(
      `/attendance/person/${personId}`,
      { params },
    );
    return res.data.data;
  },
};
