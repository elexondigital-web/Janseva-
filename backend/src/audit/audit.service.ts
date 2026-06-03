import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types';

/**
 * Centralized audit logging.
 *
 * Every state-changing admin action goes through `log()`. The call is
 * fire-and-forget from the caller's perspective: failures are swallowed
 * with a warning so a transient DB hiccup never breaks the user-facing
 * action that triggered the audit.
 *
 * Stored denormalized (adminName, blockId snapshot) so the row stays
 * meaningful even if the admin is later renamed or removed.
 */
export interface AuditEntry {
  adminId: string;
  adminName: string;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  blockId?: string | null;
}

export const AuditAction = {
  // auth
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  // people
  CREATE_PERSON: 'CREATE_PERSON',
  UPDATE_PERSON: 'UPDATE_PERSON',
  DELETE_PERSON: 'DELETE_PERSON',
  ENROLL_FINGERPRINT: 'ENROLL_FINGERPRINT',
  // admins
  CREATE_ADMIN: 'CREATE_ADMIN',
  UPDATE_ADMIN: 'UPDATE_ADMIN',
  DEACTIVATE_ADMIN: 'DEACTIVATE_ADMIN',
  RESET_PASSWORD: 'RESET_PASSWORD',
  // messaging
  SEND_MESSAGE: 'SEND_MESSAGE',
  // attendance
  MARK_ATTENDANCE: 'MARK_ATTENDANCE',
  UNMARK_ATTENDANCE: 'UNMARK_ATTENDANCE',
  CREATE_EVENT: 'CREATE_EVENT',
  UPDATE_EVENT: 'UPDATE_EVENT',
  DELETE_EVENT: 'DELETE_EVENT',
  // id cards
  ISSUE_CARD: 'ISSUE_CARD',
  REVOKE_CARD: 'REVOKE_CARD',
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditService');

  constructor(private prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          adminId: entry.adminId,
          adminName: entry.adminName,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          details: entry.details ?? null,
          ipAddress: entry.ipAddress ?? null,
          blockId: entry.blockId ?? null,
        },
      });
    } catch (err: any) {
      // Audit failures must never crash the caller — log and move on.
      this.logger.warn(
        `Audit write failed (action=${entry.action} entity=${entry.entity}): ${err?.message}`,
      );
    }
  }

  /** Convenience overload for actions tied to an authenticated user. */
  async logForUser(
    user: Pick<AuthenticatedUser, 'id' | 'name' | 'blockId'>,
    action: string,
    entity: string,
    opts: {
      entityId?: string | null;
      details?: string | null;
      ipAddress?: string | null;
    } = {},
  ): Promise<void> {
    return this.log({
      adminId: user.id,
      adminName: user.name,
      action,
      entity,
      entityId: opts.entityId,
      details: opts.details,
      ipAddress: opts.ipAddress,
      blockId: user.blockId ?? null,
    });
  }
}
