import api from './axios';
import type { ApiResponse, Block, Ward, Booth } from '../types';

// Extended types returned by the backend (with joins / _count)
export interface BlockWithCount extends Block {
  _count: { wards: number; people: number };
}
export interface BlockDetail extends BlockWithCount {
  wards: WardWithCount[];
}

export interface WardWithCount extends Ward {
  block?: { id: string; name: string; district: string };
  _count: { booths: number; people: number };
}
export interface WardDetail extends WardWithCount {
  booths: (Booth & { _count: { people: number } })[];
}

export interface BoothWithCount extends Booth {
  ward?: {
    id: string;
    name: string;
    blockId: string;
    block?: { id: string; name: string; district: string };
  };
  _count: { people: number };
}

// Payloads
export interface CreateBlockPayload {
  name: string;
  district: string;
  state?: string;
}
export interface UpdateBlockPayload extends Partial<CreateBlockPayload> {}

export interface CreateWardPayload {
  name: string;
  blockId: string;
}
export interface UpdateWardPayload extends Partial<CreateWardPayload> {}

export interface CreateBoothPayload {
  name: string;
  wardId: string;
  location?: string;
}
export interface UpdateBoothPayload extends Partial<CreateBoothPayload> {}

// ==== BLOCKS ====
export const blocksApi = {
  async list(): Promise<BlockWithCount[]> {
    const res = await api.get<ApiResponse<BlockWithCount[]>>('/blocks');
    return res.data.data;
  },
  async get(id: string): Promise<BlockDetail> {
    const res = await api.get<ApiResponse<BlockDetail>>(`/blocks/${id}`);
    return res.data.data;
  },
  async create(payload: CreateBlockPayload): Promise<BlockWithCount> {
    const res = await api.post<ApiResponse<BlockWithCount>>('/blocks', payload);
    return res.data.data;
  },
  async update(id: string, payload: UpdateBlockPayload): Promise<BlockWithCount> {
    const res = await api.patch<ApiResponse<BlockWithCount>>(
      `/blocks/${id}`,
      payload,
    );
    return res.data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/blocks/${id}`);
  },
};

// ==== WARDS ====
export const wardsApi = {
  async list(blockId?: string): Promise<WardWithCount[]> {
    const res = await api.get<ApiResponse<WardWithCount[]>>('/wards', {
      params: blockId ? { blockId } : undefined,
    });
    return res.data.data;
  },
  async get(id: string): Promise<WardDetail> {
    const res = await api.get<ApiResponse<WardDetail>>(`/wards/${id}`);
    return res.data.data;
  },
  async create(payload: CreateWardPayload): Promise<WardWithCount> {
    const res = await api.post<ApiResponse<WardWithCount>>('/wards', payload);
    return res.data.data;
  },
  async update(id: string, payload: UpdateWardPayload): Promise<WardWithCount> {
    const res = await api.patch<ApiResponse<WardWithCount>>(
      `/wards/${id}`,
      payload,
    );
    return res.data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/wards/${id}`);
  },
};

// ==== BOOTHS ====
export const boothsApi = {
  async list(params?: { wardId?: string; blockId?: string }): Promise<BoothWithCount[]> {
    const res = await api.get<ApiResponse<BoothWithCount[]>>('/booths', {
      params,
    });
    return res.data.data;
  },
  async get(id: string): Promise<BoothWithCount> {
    const res = await api.get<ApiResponse<BoothWithCount>>(`/booths/${id}`);
    return res.data.data;
  },
  async create(payload: CreateBoothPayload): Promise<BoothWithCount> {
    const res = await api.post<ApiResponse<BoothWithCount>>('/booths', payload);
    return res.data.data;
  },
  async update(id: string, payload: UpdateBoothPayload): Promise<BoothWithCount> {
    const res = await api.patch<ApiResponse<BoothWithCount>>(
      `/booths/${id}`,
      payload,
    );
    return res.data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/booths/${id}`);
  },
};
