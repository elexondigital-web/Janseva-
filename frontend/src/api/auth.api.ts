import api from './axios';
import type { LoginResponse, ApiResponse, AdminRole } from '../types';

export interface LoginPayload {
  email: string;
  password: string;
  role?: AdminRole;
}

export const authApi = {
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const res = await api.post<ApiResponse<LoginResponse>>('/auth/login', payload);
    return res.data.data;
  },

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    const res = await api.post<ApiResponse<{ accessToken: string }>>('/auth/refresh', {
      refreshToken,
    });
    return res.data.data;
  },

  async logout(refreshToken?: string): Promise<void> {
    await api.post('/auth/logout', refreshToken ? { refreshToken } : {});
  },
};
