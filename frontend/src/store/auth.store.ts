import { create } from 'zustand';
import type { AuthUser } from '../types';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  updateToken: (accessToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('janseva_user') || 'null'),
  accessToken: localStorage.getItem('janseva_access_token'),
  refreshToken: localStorage.getItem('janseva_refresh_token'),
  isAuthenticated: !!localStorage.getItem('janseva_access_token'),

  setAuth: (user, accessToken, refreshToken) => {
    localStorage.setItem('janseva_user', JSON.stringify(user));
    localStorage.setItem('janseva_access_token', accessToken);
    localStorage.setItem('janseva_refresh_token', refreshToken);
    set({ user, accessToken, refreshToken, isAuthenticated: true });
  },

  updateToken: (accessToken) => {
    localStorage.setItem('janseva_access_token', accessToken);
    set({ accessToken });
  },

  logout: () => {
    localStorage.removeItem('janseva_user');
    localStorage.removeItem('janseva_access_token');
    localStorage.removeItem('janseva_refresh_token');
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  },
}));
