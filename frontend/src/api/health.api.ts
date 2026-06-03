import api from './axios';

export interface HealthInfo {
  ok: boolean;
  db: 'up' | 'down';
  uptime: number;
  providers: {
    sms: boolean;
    whatsapp: boolean;
    email: boolean;
    s3: boolean;
  };
  demoMode: boolean;
  timestamp: string;
}

export const healthApi = {
  /**
   * Fetch the public health endpoint. The shape includes which
   * optional integrations are configured so pages can show a
   * "demo mode" banner where appropriate.
   *
   * Returns null on any error — callers should fall back to a
   * "no banner" rendering instead of crashing.
   */
  async get(): Promise<HealthInfo | null> {
    try {
      const res = await api.get<HealthInfo>('/dashboard/health');
      return res.data;
    } catch {
      return null;
    }
  },
};
