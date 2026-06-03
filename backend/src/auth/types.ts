import { AdminRole } from '@prisma/client';

export interface JwtPayload {
  sub: string; // admin id
  email: string;
  role: AdminRole;
  blockId?: string | null;
  wardId?: string | null;
  boothId?: string | null;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  blockId: string | null;
  wardId: string | null;
  boothId: string | null;
}
