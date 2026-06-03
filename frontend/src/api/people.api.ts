import api from './axios';
import type {
  ApiResponse,
  Gender,
  Category,
  PartyRole,
  Status,
} from '../types';

interface PersonBase {
  id: string;
  uniqueId: string;
  fullName: string;
  fatherName: string | null;
  dob: string | null;
  gender: Gender;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  aadhaarNumber: string | null;
  voterId: string | null;
  address: string | null;
  pincode: string | null;
  occupation: string | null;
  caste: string | null;
  category: Category;
  photoUrl: string | null;
  aadhaarImageUrl: string | null;
  role: PartyRole;
  status: Status;
  boothId: string;
  wardId: string;
  blockId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonListItem extends PersonBase {
  block?: { id: string; name: string };
  ward?: { id: string; name: string };
  booth?: { id: string; name: string };
  idCard?: { id: string; uniqueCardId: string; issuedAt: string } | null;
}

export interface PersonDetail extends PersonBase {
  block?: { id: string; name: string; district: string };
  ward?: { id: string; name: string };
  booth?: { id: string; name: string; location: string | null };
  idCard: {
    id: string;
    personId: string;
    uniqueCardId: string;
    qrCodeData: string;
    issuedAt: string;
    isActive: boolean;
  } | null;
}

export interface PeopleListResponse {
  items: PersonListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListPeopleParams {
  search?: string;
  blockId?: string;
  wardId?: string;
  boothId?: string;
  gender?: Gender;
  category?: Category;
  role?: PartyRole;
  status?: Status;
  page?: number;
  limit?: number;
}

export interface SearchPeopleParams {
  q?: string;
  wardId?: string;
  boothId?: string;
  gender?: Gender;
  status?: Status;
  ageMin?: number;
  ageMax?: number;
  page?: number;
  limit?: number;
}

export interface SearchPeopleResponse extends PeopleListResponse {
  query: string;
}

export interface CreatePersonPayload {
  fullName: string;
  fatherName?: string;
  dob?: string;
  gender: Gender;
  phone: string;
  whatsapp?: string;
  email?: string;
  aadhaarNumber?: string;
  voterId?: string;
  address?: string;
  pincode?: string;
  occupation?: string;
  caste?: string;
  category?: Category;
  photoUrl?: string;
  aadhaarImageUrl?: string;
  role?: PartyRole;
  status?: Status;
  blockId: string;
  wardId: string;
  boothId: string;
}

export interface UpdatePersonPayload extends Partial<CreatePersonPayload> {}

export interface PeopleStats {
  total: number;
  byGender: { gender: Gender; count: number }[];
  byRole: { role: PartyRole; count: number }[];
  byStatus: { status: Status; count: number }[];
}

export const peopleApi = {
  async list(params: ListPeopleParams = {}): Promise<PeopleListResponse> {
    const res = await api.get<ApiResponse<PeopleListResponse>>('/people', { params });
    return res.data.data;
  },
  async search(params: SearchPeopleParams = {}): Promise<SearchPeopleResponse> {
    const res = await api.get<ApiResponse<SearchPeopleResponse>>('/people/search', { params });
    return res.data.data;
  },
  async get(id: string): Promise<PersonDetail> {
    const res = await api.get<ApiResponse<PersonDetail>>(`/people/${id}`);
    return res.data.data;
  },
  async create(payload: CreatePersonPayload): Promise<PersonDetail> {
    const res = await api.post<ApiResponse<PersonDetail>>('/people', payload);
    return res.data.data;
  },
  async update(id: string, payload: UpdatePersonPayload): Promise<PersonDetail> {
    const res = await api.patch<ApiResponse<PersonDetail>>(`/people/${id}`, payload);
    return res.data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/people/${id}`);
  },
  async stats(): Promise<PeopleStats> {
    const res = await api.get<ApiResponse<PeopleStats>>('/people/stats');
    return res.data.data;
  },

  /** Phase 3: enroll a fingerprint template against a person. */
  async enrollFingerprint(
    id: string,
    fingerprintTemplate: string,
  ): Promise<{ id: string; enrolled: true }> {
    const res = await api.post<ApiResponse<{ id: string; enrolled: true }>>(
      `/people/${id}/enroll-fingerprint`,
      { fingerprintTemplate },
    );
    return res.data.data;
  },

  /** Phase 3: is this person enrolled? Template is never returned. */
  async fingerprintStatus(
    id: string,
  ): Promise<{ id: string; enrolled: boolean }> {
    const res = await api.get<ApiResponse<{ id: string; enrolled: boolean }>>(
      `/people/${id}/fingerprint-status`,
    );
    return res.data.data;
  },
};
