import api from './axios';
import type { ApiResponse, MessageType, TargetLevel } from '../types';

export interface MessageRecord {
  id: string;
  type: MessageType;
  content: string;
  subject: string | null;
  sentBy: string;
  sentAt: string;
  targetLevel: TargetLevel;
  targetId: string | null;
  status: string;
  recipientCount: number;
  failedCount: number;
  blockId: string;
}

export interface ListMessagesResponse {
  items: MessageRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListMessagesParams {
  type?: MessageType;
  blockId?: string;
  page?: number;
  limit?: number;
}

export interface SendMessagePayload {
  type: MessageType;
  content: string;
  subject?: string;
  targetLevel: TargetLevel;
  targetId?: string;
  blockId?: string;
}

export interface SendMessageResult {
  messageId: string;
  recipientCount: number;
  message: string;
}

export const messagingApi = {
  async send(payload: SendMessagePayload): Promise<SendMessageResult> {
    const res = await api.post<ApiResponse<SendMessageResult>>(
      '/messages/send',
      payload,
    );
    return res.data.data;
  },
  async list(
    params: ListMessagesParams = {},
  ): Promise<ListMessagesResponse> {
    const res = await api.get<ApiResponse<ListMessagesResponse>>('/messages', {
      params,
    });
    return res.data.data;
  },
  async get(id: string): Promise<MessageRecord> {
    const res = await api.get<ApiResponse<MessageRecord>>(`/messages/${id}`);
    return res.data.data;
  },
};
