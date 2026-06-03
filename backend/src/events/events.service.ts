import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { AuthenticatedUser } from '../auth/types';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  /** Read scope. Events cascade down the block/ward/booth tree. */
  private buildScopeWhere(user: AuthenticatedUser): Prisma.EventWhereInput {
    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
        return {};
      case AdminRole.BLOCK_ADMIN:
        return { blockId: user.blockId ?? '__none__' };
      case AdminRole.WARD_ADMIN:
        // Ward admins see block-wide events + their own ward events + booth events in their ward.
        return {
          AND: [
            { blockId: user.blockId ?? '__none__' },
            {
              OR: [
                { wardId: null },
                { wardId: user.wardId ?? '__none__' },
              ],
            },
          ],
        };
      case AdminRole.BOOTH_WORKER:
        return {
          AND: [
            { blockId: user.blockId ?? '__none__' },
            {
              OR: [
                { wardId: null, boothId: null },
                { wardId: user.wardId ?? '__none__', boothId: null },
                { boothId: user.boothId ?? '__none__' },
              ],
            },
          ],
        };
    }
  }

  /** Write scope. BOOTH_WORKER cannot create/edit events. */
  private assertWriteScope(
    user: AuthenticatedUser,
    target: { blockId: string; wardId?: string | null; boothId?: string | null },
  ): void {
    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
        return;
      case AdminRole.BLOCK_ADMIN:
        if (target.blockId !== user.blockId)
          throw new ForbiddenException('Cannot modify events outside your block');
        return;
      case AdminRole.WARD_ADMIN:
        if (target.blockId !== user.blockId)
          throw new ForbiddenException('Cannot modify events outside your block');
        if (target.wardId && target.wardId !== user.wardId)
          throw new ForbiddenException('Cannot modify events outside your ward');
        return;
      case AdminRole.BOOTH_WORKER:
        throw new ForbiddenException('Booth workers cannot modify events');
    }
  }

  private async assertHierarchyConsistent(
    blockId: string,
    wardId?: string | null,
    boothId?: string | null,
  ): Promise<void> {
    const block = await this.prisma.block.findUnique({ where: { id: blockId } });
    if (!block) throw new BadRequestException(`Block ${blockId} does not exist`);

    if (wardId) {
      const ward = await this.prisma.ward.findUnique({ where: { id: wardId } });
      if (!ward) throw new BadRequestException(`Ward ${wardId} does not exist`);
      if (ward.blockId !== blockId)
        throw new BadRequestException('wardId does not belong to blockId');
    }

    if (boothId) {
      if (!wardId)
        throw new BadRequestException('wardId is required when boothId is set');
      const booth = await this.prisma.booth.findUnique({
        where: { id: boothId },
      });
      if (!booth) throw new BadRequestException(`Booth ${boothId} does not exist`);
      if (booth.wardId !== wardId)
        throw new BadRequestException('boothId does not belong to wardId');
    }
  }

  async findAll(user: AuthenticatedUser, query: ListEventsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.EventWhereInput = { ...this.buildScopeWhere(user) };

    if (query.blockId) where.blockId = query.blockId;
    if (query.wardId) where.wardId = query.wardId;
    if (query.boothId) where.boothId = query.boothId;
    if (query.type) where.type = query.type;

    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) where.date.lte = new Date(query.dateTo);
    }

    if (query.when === 'upcoming') {
      where.date = { ...(where.date as Prisma.DateTimeFilter), gte: new Date() };
    } else if (query.when === 'past') {
      where.date = { ...(where.date as Prisma.DateTimeFilter), lt: new Date() };
    }

    if (query.q && query.q.trim().length > 0) {
      const s = query.q.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { location: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          block: { select: { id: true, name: true } },
          ward: { select: { id: true, name: true } },
          booth: { select: { id: true, name: true } },
          _count: { select: { attendances: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        block: { select: { id: true, name: true, district: true } },
        ward: { select: { id: true, name: true } },
        booth: { select: { id: true, name: true, location: true } },
        _count: { select: { attendances: true } },
      },
    });
    if (!event) throw new NotFoundException(`Event ${id} not found`);

    const scope = this.buildScopeWhere(user);
    const visible = await this.prisma.event.findFirst({
      where: { AND: [{ id }, scope] },
      select: { id: true },
    });
    if (!visible) throw new ForbiddenException('Access denied');

    return event;
  }

  async create(dto: CreateEventDto, user: AuthenticatedUser) {
    await this.assertHierarchyConsistent(dto.blockId, dto.wardId, dto.boothId);
    this.assertWriteScope(user, {
      blockId: dto.blockId,
      wardId: dto.wardId,
      boothId: dto.boothId,
    });

    const event = await this.prisma.event.create({
      data: {
        name: dto.name,
        type: dto.type,
        date: new Date(dto.date),
        location: dto.location,
        description: dto.description,
        blockId: dto.blockId,
        wardId: dto.wardId,
        boothId: dto.boothId,
        targetLevel: dto.targetLevel,
      },
      include: {
        block: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } },
        booth: { select: { id: true, name: true } },
      },
    });
    return event;
  }

  async update(id: string, dto: UpdateEventDto, user: AuthenticatedUser) {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Event ${id} not found`);

    this.assertWriteScope(user, {
      blockId: existing.blockId,
      wardId: existing.wardId,
      boothId: existing.boothId,
    });

    const nextBlockId = dto.blockId ?? existing.blockId;
    const nextWardId = dto.wardId !== undefined ? dto.wardId : existing.wardId;
    const nextBoothId = dto.boothId !== undefined ? dto.boothId : existing.boothId;

    if (
      dto.blockId !== undefined ||
      dto.wardId !== undefined ||
      dto.boothId !== undefined
    ) {
      await this.assertHierarchyConsistent(nextBlockId, nextWardId, nextBoothId);
      this.assertWriteScope(user, {
        blockId: nextBlockId,
        wardId: nextWardId,
        boothId: nextBoothId,
      });
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        date: dto.date ? new Date(dto.date) : undefined,
        location: dto.location,
        description: dto.description,
        blockId: dto.blockId,
        wardId: dto.wardId,
        boothId: dto.boothId,
        targetLevel: dto.targetLevel,
      },
      include: {
        block: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } },
        booth: { select: { id: true, name: true } },
      },
    });
    return updated;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const existing = await this.prisma.event.findUnique({
      where: { id },
      include: { _count: { select: { attendances: true } } },
    });
    if (!existing) throw new NotFoundException(`Event ${id} not found`);

    this.assertWriteScope(user, {
      blockId: existing.blockId,
      wardId: existing.wardId,
      boothId: existing.boothId,
    });

    if (existing._count.attendances > 0) {
      throw new ConflictException(
        'Cannot delete event with attendance records. Revoke them first.',
      );
    }

    await this.prisma.event.delete({ where: { id } });
    return { id, deleted: true };
  }
}
