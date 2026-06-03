import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types';
import { AuditAction, AuditService } from '../audit/audit.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { ListAdminsDto } from './dto/list-admins.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AdminsService {
  private readonly logger = new Logger('AdminsService');

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ----- helpers ----------------------------------------------------------

  /**
   * Generate a 12-char URL-safe temp password — printable Base64
   * minus padding, with at least one digit and one letter so the
   * resulting string passes most password complexity checks.
   */
  private generateTempPassword(): string {
    // 9 random bytes → 12 base64url chars; collisions astronomically unlikely.
    const raw = crypto.randomBytes(9).toString('base64url');
    // Guarantee at least one digit by appending a 0–9 if none present.
    return /\d/.test(raw) ? raw : raw + '7';
  }

  /**
   * The role determines which scope IDs are required.
   *
   *   SUPER_ADMIN    → no scope (blockId/wardId/boothId all null)
   *   BLOCK_ADMIN    → blockId required
   *   WARD_ADMIN     → blockId + wardId required
   *   BOOTH_WORKER   → blockId + wardId + boothId required
   */
  private validateScope(role: AdminRole, scope: {
    blockId?: string | null;
    wardId?: string | null;
    boothId?: string | null;
  }): void {
    switch (role) {
      case AdminRole.SUPER_ADMIN:
        return;
      case AdminRole.BLOCK_ADMIN:
        if (!scope.blockId)
          throw new BadRequestException('BLOCK_ADMIN requires blockId');
        return;
      case AdminRole.WARD_ADMIN:
        if (!scope.blockId || !scope.wardId)
          throw new BadRequestException(
            'WARD_ADMIN requires blockId and wardId',
          );
        return;
      case AdminRole.BOOTH_WORKER:
        if (!scope.blockId || !scope.wardId || !scope.boothId)
          throw new BadRequestException(
            'BOOTH_WORKER requires blockId, wardId, and boothId',
          );
        return;
    }
  }

  /**
   * Verify the hierarchy IDs actually link up: the booth belongs to the
   * ward, the ward belongs to the block. Mirrors people.service.
   */
  private async assertHierarchy(
    blockId: string | null | undefined,
    wardId: string | null | undefined,
    boothId: string | null | undefined,
  ): Promise<void> {
    if (boothId) {
      const booth = await this.prisma.booth.findUnique({
        where: { id: boothId },
        include: { ward: true },
      });
      if (!booth)
        throw new BadRequestException(`Booth ${boothId} does not exist`);
      if (wardId && booth.wardId !== wardId)
        throw new BadRequestException('boothId does not belong to wardId');
      if (blockId && booth.ward.blockId !== blockId)
        throw new BadRequestException('wardId does not belong to blockId');
    } else if (wardId) {
      const ward = await this.prisma.ward.findUnique({
        where: { id: wardId },
      });
      if (!ward)
        throw new BadRequestException(`Ward ${wardId} does not exist`);
      if (blockId && ward.blockId !== blockId)
        throw new BadRequestException('wardId does not belong to blockId');
    } else if (blockId) {
      const block = await this.prisma.block.findUnique({
        where: { id: blockId },
      });
      if (!block)
        throw new BadRequestException(`Block ${blockId} does not exist`);
    }
  }

  /**
   * Send a welcome email with the temp password. Best-effort: a missing
   * SMTP config logs and returns silently so admin creation still succeeds
   * even on a fresh deploy where mail isn't configured yet.
   */
  private async sendWelcomeEmail(
    name: string,
    email: string,
    tempPassword: string,
    role: AdminRole,
  ): Promise<{ sent: boolean }> {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const userId = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const fromName = process.env.SMTP_FROM_NAME ?? 'JanSeva';
    const frontendUrl = process.env.FRONTEND_URL ?? '';

    if (!host || !port || !userId || !pass) {
      this.logger.warn(
        `SMTP not configured; skipping welcome email to ${email}`,
      );
      return { sent: false };
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: false,
      auth: { user: userId, pass },
    });

    const html = `
      <p>Hi ${name},</p>
      <p>Your JanSeva ${role.replace(/_/g, ' ').toLowerCase()} account has been created.</p>
      <p>Sign in here: <a href="${frontendUrl}/login">${frontendUrl || '(your JanSeva URL)'}</a></p>
      <p style="font-family: monospace; padding: 8px 12px; background: #f6f7f9; border-radius: 4px; display: inline-block;">
        Email: <strong>${email}</strong><br/>
        Temporary password: <strong>${tempPassword}</strong>
      </p>
      <p>You will be asked to change this password on first login.</p>
      <p>— JanSeva Team</p>
    `;

    try {
      await transporter.sendMail({
        from: `"${fromName}" <${userId}>`,
        to: email,
        subject: 'Welcome to JanSeva — your admin account',
        html,
      });
      return { sent: true };
    } catch (err: any) {
      this.logger.error(`Welcome email failed for ${email}: ${err?.message}`);
      return { sent: false };
    }
  }

  /** Strip secrets and join scope rows. Never returns passwordHash. */
  private async hydrate(adminId: string) {
    const a = await this.prisma.admin.findUnique({
      where: { id: adminId },
      include: {
        block: { select: { id: true, name: true, district: true } },
        ward: { select: { id: true, name: true } },
        booth: { select: { id: true, name: true } },
      },
    });
    if (!a) throw new NotFoundException(`Admin ${adminId} not found`);
    return this.toPublic(a);
  }

  /** Public DTO shape — passwordHash never leaves this method. */
  private toPublic(a: Prisma.AdminGetPayload<{
    include: {
      block: { select: { id: true; name: true; district: true } };
      ward: { select: { id: true; name: true } };
      booth: { select: { id: true; name: true } };
    };
  }>) {
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      role: a.role,
      blockId: a.blockId,
      wardId: a.wardId,
      boothId: a.boothId,
      block: a.block,
      ward: a.ward,
      booth: a.booth,
      isActive: a.isActive,
      mustChangePassword: a.mustChangePassword,
      lastLoginAt: a.lastLoginAt,
      loginCount: a.loginCount,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  // ----- API surface ------------------------------------------------------

  async create(dto: CreateAdminDto, actor: AuthenticatedUser) {
    if (actor.role !== AdminRole.SUPER_ADMIN) {
      // Block admins may only create lower roles within their own block.
      if (actor.role !== AdminRole.BLOCK_ADMIN)
        throw new ForbiddenException('Only SUPER_ADMIN or BLOCK_ADMIN may create admins');
      if (dto.role === AdminRole.SUPER_ADMIN || dto.role === AdminRole.BLOCK_ADMIN)
        throw new ForbiddenException(
          'BLOCK_ADMIN cannot create SUPER_ADMIN or BLOCK_ADMIN accounts',
        );
      if (dto.blockId && dto.blockId !== actor.blockId)
        throw new ForbiddenException('Cannot assign admin outside your block');
      // Force the new admin into the actor's block.
      dto.blockId = actor.blockId ?? dto.blockId;
    }

    this.validateScope(dto.role, {
      blockId: dto.blockId,
      wardId: dto.wardId,
      boothId: dto.boothId,
    });
    await this.assertHierarchy(dto.blockId, dto.wardId, dto.boothId);

    const dup = await this.prisma.admin.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (dup) throw new ConflictException('Email already in use');

    const usingTemp = !dto.password;
    const plainPassword = dto.password ?? this.generateTempPassword();
    const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

    const created = await this.prisma.admin.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role,
        blockId: dto.role === AdminRole.SUPER_ADMIN ? null : dto.blockId ?? null,
        wardId:
          dto.role === AdminRole.WARD_ADMIN || dto.role === AdminRole.BOOTH_WORKER
            ? dto.wardId ?? null
            : null,
        boothId: dto.role === AdminRole.BOOTH_WORKER ? dto.boothId ?? null : null,
        mustChangePassword: usingTemp,
        isActive: true,
      },
    });

    let emailSent = false;
    if (dto.sendEmail !== false) {
      const r = await this.sendWelcomeEmail(
        created.name,
        created.email,
        plainPassword,
        created.role,
      );
      emailSent = r.sent;
    }

    void this.audit.logForUser(actor, AuditAction.CREATE_ADMIN, 'Admin', {
      entityId: created.id,
      details: `${created.name} <${created.email}> as ${created.role}`,
    });

    return {
      admin: await this.hydrate(created.id),
      // We surface the temp password ONCE to the creator so they can hand
      // it off out-of-band (printed slip, secure chat) when SMTP is down.
      tempPassword: usingTemp ? plainPassword : undefined,
      emailSent,
    };
  }

  async list(actor: AuthenticatedUser, dto: ListAdminsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.AdminWhereInput = {};

    if (actor.role !== AdminRole.SUPER_ADMIN) {
      // Block admins (and below — but typically only block admins access
      // this page in the UI) see admins in their block only.
      if (!actor.blockId)
        throw new ForbiddenException('Account has no block assigned');
      where.blockId = actor.blockId;
      // Block admin may not see super admins.
      where.role = { not: AdminRole.SUPER_ADMIN };
    } else if (dto.blockId) {
      where.blockId = dto.blockId;
    }

    if (dto.role) where.role = dto.role;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.admin.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        include: {
          block: { select: { id: true, name: true, district: true } },
          ward: { select: { id: true, name: true } },
          booth: { select: { id: true, name: true } },
        },
      }),
      this.prisma.admin.count({ where }),
    ]);

    return {
      items: items.map((a) => this.toPublic(a)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async get(id: string, actor: AuthenticatedUser) {
    const admin = await this.prisma.admin.findUnique({
      where: { id },
      include: {
        block: { select: { id: true, name: true, district: true } },
        ward: { select: { id: true, name: true } },
        booth: { select: { id: true, name: true } },
      },
    });
    if (!admin) throw new NotFoundException(`Admin ${id} not found`);

    if (actor.role !== AdminRole.SUPER_ADMIN) {
      if (admin.role === AdminRole.SUPER_ADMIN)
        throw new ForbiddenException('Cannot view super admin');
      if (admin.blockId !== actor.blockId)
        throw new ForbiddenException('Out of block scope');
    }
    return this.toPublic(admin);
  }

  async update(id: string, dto: UpdateAdminDto, actor: AuthenticatedUser) {
    const target = await this.prisma.admin.findUnique({ where: { id } });
    if (!target) throw new NotFoundException(`Admin ${id} not found`);

    // Cannot change own role; cannot deactivate yourself.
    if (target.id === actor.id) {
      if (dto.role !== undefined && dto.role !== target.role)
        throw new ForbiddenException('Cannot change your own role');
      if (dto.isActive === false)
        throw new ForbiddenException('Cannot deactivate your own account');
    }

    if (actor.role !== AdminRole.SUPER_ADMIN) {
      if (actor.role !== AdminRole.BLOCK_ADMIN)
        throw new ForbiddenException('Only SUPER_ADMIN or BLOCK_ADMIN may update admins');
      if (target.role === AdminRole.SUPER_ADMIN)
        throw new ForbiddenException('Cannot modify super admin');
      if (target.blockId !== actor.blockId)
        throw new ForbiddenException('Cannot modify admin outside your block');
      if (
        dto.role &&
        (dto.role === AdminRole.SUPER_ADMIN || dto.role === AdminRole.BLOCK_ADMIN)
      )
        throw new ForbiddenException('Cannot promote to SUPER_ADMIN or BLOCK_ADMIN');
    }

    // Validate scope of the new role state.
    const nextRole = dto.role ?? target.role;
    const nextBlockId =
      dto.blockId !== undefined ? dto.blockId : target.blockId;
    const nextWardId = dto.wardId !== undefined ? dto.wardId : target.wardId;
    const nextBoothId =
      dto.boothId !== undefined ? dto.boothId : target.boothId;

    this.validateScope(nextRole, {
      blockId: nextBlockId,
      wardId: nextWardId,
      boothId: nextBoothId,
    });
    await this.assertHierarchy(nextBlockId, nextWardId, nextBoothId);

    await this.prisma.admin.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role,
        blockId: nextRole === AdminRole.SUPER_ADMIN ? null : nextBlockId,
        wardId:
          nextRole === AdminRole.WARD_ADMIN ||
          nextRole === AdminRole.BOOTH_WORKER
            ? nextWardId
            : null,
        boothId: nextRole === AdminRole.BOOTH_WORKER ? nextBoothId : null,
        isActive: dto.isActive,
      },
    });

    void this.audit.logForUser(actor, AuditAction.UPDATE_ADMIN, 'Admin', {
      entityId: id,
      details: `${target.email} → role=${nextRole}, active=${
        dto.isActive ?? target.isActive
      }`,
    });

    return this.hydrate(id);
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const target = await this.prisma.admin.findUnique({ where: { id } });
    if (!target) throw new NotFoundException(`Admin ${id} not found`);

    if (target.id === actor.id)
      throw new ForbiddenException('Cannot delete your own account');

    if (actor.role !== AdminRole.SUPER_ADMIN) {
      if (actor.role !== AdminRole.BLOCK_ADMIN)
        throw new ForbiddenException('Only SUPER_ADMIN or BLOCK_ADMIN may deactivate admins');
      if (target.role === AdminRole.SUPER_ADMIN)
        throw new ForbiddenException('Cannot deactivate super admin');
      if (target.blockId !== actor.blockId)
        throw new ForbiddenException('Cannot deactivate admin outside your block');
    }

    // Soft delete only — preserves audit trail (loginCount, createdAt etc).
    await this.prisma.admin.update({
      where: { id },
      data: { isActive: false },
    });

    void this.audit.logForUser(actor, AuditAction.DEACTIVATE_ADMIN, 'Admin', {
      entityId: id,
      details: `${target.name} <${target.email}>`,
    });

    return { id, deactivated: true };
  }

  async resetPassword(id: string, actor: AuthenticatedUser) {
    const target = await this.prisma.admin.findUnique({ where: { id } });
    if (!target) throw new NotFoundException(`Admin ${id} not found`);

    if (actor.role !== AdminRole.SUPER_ADMIN) {
      if (actor.role !== AdminRole.BLOCK_ADMIN)
        throw new ForbiddenException('Only SUPER_ADMIN or BLOCK_ADMIN may reset passwords');
      if (target.role === AdminRole.SUPER_ADMIN)
        throw new ForbiddenException('Cannot reset super admin password');
      if (target.blockId !== actor.blockId)
        throw new ForbiddenException('Cannot reset admin outside your block');
    }

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
    await this.prisma.admin.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });

    const r = await this.sendWelcomeEmail(
      target.name,
      target.email,
      tempPassword,
      target.role,
    );

    void this.audit.logForUser(actor, AuditAction.RESET_PASSWORD, 'Admin', {
      entityId: id,
      details: `${target.email}${r.sent ? ' (email sent)' : ' (email skipped — SMTP not configured)'}`,
    });

    return {
      id,
      tempPassword, // returned ONCE to the actor; never persisted plain
      emailSent: r.sent,
    };
  }

  async stats(actor: AuthenticatedUser) {
    const where: Prisma.AdminWhereInput = {};
    if (actor.role !== AdminRole.SUPER_ADMIN) {
      if (!actor.blockId)
        throw new ForbiddenException('Account has no block assigned');
      where.blockId = actor.blockId;
      where.role = { not: AdminRole.SUPER_ADMIN };
    }

    const [total, active] = await Promise.all([
      this.prisma.admin.count({ where }),
      this.prisma.admin.count({ where: { ...where, isActive: true } }),
    ]);

    const byRole = await this.prisma.admin.groupBy({
      by: ['role'],
      where,
      _count: { _all: true },
    });

    const roleCounts: Record<AdminRole, number> = {
      SUPER_ADMIN: 0,
      BLOCK_ADMIN: 0,
      WARD_ADMIN: 0,
      BOOTH_WORKER: 0,
    };
    for (const r of byRole) roleCounts[r.role] = r._count._all;

    return { total, active, inactive: total - active, byRole: roleCounts };
  }
}
