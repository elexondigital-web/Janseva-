import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './types';
import { AuditAction, AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  /**
   * In-memory store of valid refresh tokens per admin.
   * Phase 1: simple Map-based store — sufficient for a single-process dev
   * deployment. Replace with Redis / DB table in production for persistence
   * and horizontal scalability.
   */
  private readonly validRefreshTokens = new Map<string, Set<string>>();

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new ForbiddenException('Account is disabled. Contact your administrator.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // If role was provided on the form, make sure it matches — SUPER_ADMIN can log in as anyone.
    if (dto.role && admin.role !== dto.role && admin.role !== AdminRole.SUPER_ADMIN) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = await this.issueTokens(admin);
    this.storeRefreshToken(admin.id, refreshToken);

    // Phase 4: track last-login + login count for the audit dashboard. Done
    // post-token-issue so a DB hiccup here doesn't block the login itself —
    // we don't await/catch in the response path to keep the login call fast.
    this.prisma.admin
      .update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date(), loginCount: { increment: 1 } },
      })
      .catch(() => {
        /* best-effort metric; don't fail login on this */
      });

    // Audit: LOGIN. Fire-and-forget; AuditService swallows errors itself.
    void this.audit.log({
      adminId: admin.id,
      adminName: admin.name,
      action: AuditAction.LOGIN,
      entity: 'Admin',
      entityId: admin.id,
      ipAddress,
      blockId: admin.blockId ?? null,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        blockId: admin.blockId,
        wardId: admin.wardId,
        boothId: admin.boothId,
        mustChangePassword: admin.mustChangePassword,
      },
    };
  }

  async refresh(userId: string, refreshToken: string) {
    const validTokens = this.validRefreshTokens.get(userId);
    if (!validTokens || !validTokens.has(refreshToken)) {
      throw new UnauthorizedException('Refresh token is invalid or has been revoked');
    }

    const admin = await this.prisma.admin.findUnique({ where: { id: userId } });
    if (!admin || !admin.isActive) {
      this.revokeAllTokens(userId);
      throw new UnauthorizedException('User not found or inactive');
    }

    const accessToken = await this.signAccessToken(admin);
    return { accessToken };
  }

  async logout(
    userId: string,
    refreshToken?: string,
    ipAddress?: string,
  ) {
    if (refreshToken) {
      const tokens = this.validRefreshTokens.get(userId);
      if (tokens) {
        tokens.delete(refreshToken);
        if (tokens.size === 0) {
          this.validRefreshTokens.delete(userId);
        }
      }
    } else {
      this.revokeAllTokens(userId);
    }

    // Audit: best-effort name lookup; if the admin row is gone, log the id alone.
    const admin = await this.prisma.admin
      .findUnique({
        where: { id: userId },
        select: { name: true, blockId: true },
      })
      .catch(() => null);
    void this.audit.log({
      adminId: userId,
      adminName: admin?.name ?? '(unknown)',
      action: AuditAction.LOGOUT,
      entity: 'Admin',
      entityId: userId,
      ipAddress,
      blockId: admin?.blockId ?? null,
    });

    return { message: 'Logged out successfully' };
  }

  private async issueTokens(admin: {
    id: string;
    email: string;
    role: AdminRole;
    blockId: string | null;
    wardId: string | null;
    boothId: string | null;
  }) {
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(admin),
      this.signRefreshToken(admin),
    ]);
    return { accessToken, refreshToken };
  }

  private async signAccessToken(admin: {
    id: string;
    email: string;
    role: AdminRole;
    blockId: string | null;
    wardId: string | null;
    boothId: string | null;
  }) {
    const payload: JwtPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      blockId: admin.blockId,
      wardId: admin.wardId,
      boothId: admin.boothId,
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_EXPIRY') || '15m') as JwtSignOptions['expiresIn'],
    });
  }

  private async signRefreshToken(admin: {
    id: string;
    email: string;
    role: AdminRole;
    blockId: string | null;
    wardId: string | null;
    boothId: string | null;
  }) {
    const payload: JwtPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      blockId: admin.blockId,
      wardId: admin.wardId,
      boothId: admin.boothId,
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRY') || '7d') as JwtSignOptions['expiresIn'],
    });
  }

  private storeRefreshToken(userId: string, token: string) {
    let tokens = this.validRefreshTokens.get(userId);
    if (!tokens) {
      tokens = new Set();
      this.validRefreshTokens.set(userId, tokens);
    }
    tokens.add(token);
  }

  private revokeAllTokens(userId: string) {
    this.validRefreshTokens.delete(userId);
  }
}
