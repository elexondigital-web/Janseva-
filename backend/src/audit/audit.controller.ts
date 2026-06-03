import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminRole, Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditDto } from './dto/list-audit.dto';
import { AuthenticatedUser } from '../auth/types';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  private getUser(req: Request): AuthenticatedUser {
    return req.user as AuthenticatedUser;
  }

  @Get()
  async list(@Req() req: Request, @Query() dto: ListAuditDto) {
    const user = this.getUser(req);

    // Only SUPER_ADMIN and BLOCK_ADMIN may read audit logs.
    if (
      user.role !== AdminRole.SUPER_ADMIN &&
      user.role !== AdminRole.BLOCK_ADMIN
    ) {
      throw new ForbiddenException('Audit logs are admin-only');
    }

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (user.role === AdminRole.SUPER_ADMIN) {
      if (dto.blockId) where.blockId = dto.blockId;
    } else {
      // Block admin: hard-pin to their own block. We accept BOTH rows tagged
      // with their blockId AND rows where the actor was them (covers actions
      // that didn't carry a block context, e.g. login).
      if (!user.blockId)
        throw new ForbiddenException('Account has no block assigned');
      where.OR = [{ blockId: user.blockId }, { adminId: user.id }];
    }

    if (dto.action) where.action = dto.action;
    if (dto.entity) where.entity = dto.entity;
    if (dto.adminId) where.adminId = dto.adminId;
    if (dto.from || dto.to) {
      where.createdAt = {};
      if (dto.from) (where.createdAt as any).gte = new Date(dto.from);
      if (dto.to) (where.createdAt as any).lte = new Date(dto.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
