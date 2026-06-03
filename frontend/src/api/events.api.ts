import api from './axios';
import type { ApiResponse, EventType } from '../types';

export type TargetLevel = 'ALL' | 'BLOCK' | 'WARD' | 'BOOTH';

export interface EventListItem {
  id: string;
  name: string;
  type: EventType;
  date: string;
  location: string | null;
  description: string | null;
  blockId: string;
  wardId: string | null;
  boothId: string | null;
  targetLevel: TargetLevel;
  createdAt: string;
  block: { id: string; name: string } | null;
  ward: { id: string; name: string } | null;
  booth: { id: string; name: string } | null;
  _count: { attendances: number };
}

export interface EventDetail extends EventListItem {
  block: { id: string; name: string; district: string } | null;
  booth: { id: string; name: string; location: string | null } | null;
}

export interface ListEventsParams {
  q?: string;
  type?: EventType;
  blockId?: string;
  wardId?: string;
  boothId?: string;
  dateFrom?: string;
  dateTo?: string;
  when?: 'upcoming' | 'past';
  page?: number;
  limit?: number;
}

export interface ListEventsResponse {
  items: EventListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateEventPayload {
  name: string;
  type: EventType;
  date: string;
  location?: string;
  description?: string;
  blockId: string;
  wardId?: string;
  boothId?: string;
  targetLevel?: TargetLevel;
}
export interface UpdateEventPayload extends Partial<CreateEventPayload> {}

export const eventsApi = {
  async list(params: ListEventsParams = {}): Promise<ListEventsResponse> {
    const res = await api.get<ApiResponse<ListEventsResponse>>('/events', {
      params,
    });
    return res.data.data;
  },
  async get(id: string): Promise<EventDetail> {
    const res = await api.get<ApiResponse<EventDetail>>(`/events/${id}`);
    return res.data.data;
  },
  async create(payload: CreateEventPayload): Promise<EventListItem> {
    const res = await api.post<ApiResponse<EventListItem>>('/events', payload);
    return res.data.data;
  },
  async update(
    id: string,
    payload: UpdateEventPayload,
  ): Promise<EventListItem> {
    const res = await api.patch<ApiResponse<EventListItem>>(
      `/events/${id}`,
      payload,
    );
    return res.data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/events/${id}`);
  },
};
