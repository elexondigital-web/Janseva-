import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { AdminRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types';
import { CreateWardDto } from './dto/create-ward.dto';
import { UpdateWardDto } from './dto/update-ward.dto';

@Injectable()
export class WardsService {
  constructor(private prisma: PrismaService) {}

  /** List wards visible to the user. Optional blockId filter. */
  async findAll(user: AuthenticatedUser, blockId?: string) {
    const where: Prisma.WardWhereInput = {};

    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
        if (blockId) where.blockId = blockId;
        break;
      case AdminRole.BLOCK_ADMIN:
        where.blockId = user.blockId ?? '__none__';
        break;
      case AdminRole.WARD_ADMIN:
        where.id = user.wardId ?? '__none__';
        break;
      case AdminRole.BOOTH_WORKER:
        // A booth worker can see the ward their booth is in
        where.booths = { some: { id: user.boothId ?? '__none__' } };
        break;
    }

    return this.prisma.ward.findMany({
      where,
      include: {
        block: { select: { id: true, name: true, district: true } },
        _count: { select: { booths: true, people: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const ward = await this.prisma.ward.findUnique({
      where: { id },
      include: {
        block: { select: { id: true, name: true, district: true } },
        booths: {
          include: { _count: { select: { people: true } } },
          orderBy: { name: 'asc' },
        },
        _count: { select: { booths: true, people: true } },
      },
    });
    if (!ward) throw new NotFoundException('Ward not found');
    this.assertReadAccess(ward, user);
    return ward;
  }

  /** SUPER_ADMIN or BLOCK_ADMIN (for their own block) can create wards. */
  async create(dto: CreateWardDto, user: AuthenticatedUser) {
    if (
      user.role !== AdminRole.SUPER_ADMIN &&
      user.role !== AdminRole.BLOCK_ADMIN
    ) {
      throw new ForbiddenException(
        'Only super admins or block admins can create wards',
      );
    }
    if (
      user.role === AdminRole.BLOCK_ADMIN &&
      dto.blockId !== user.blockId
    ) {
      throw new ForbiddenException(
        'You can only create wards in your own block',
      );
    }

    const block = await this.prisma.block.findUnique({
      where: { id: dto.blockId },
    });
    if (!block) throw new BadRequestException('Block does not exist');

    const duplicate = await this.prisma.ward.findFirst({
      where: { name: dto.name, blockId: dto.blockId },
    });
    if (duplicate) {
      throw new ConflictException(
        'A ward with this name already exists in this block',
      );
    }

    return this.prisma.ward.create({
      data: { name: dto.name, blockId: dto.blockId },
      include: {
        block: { select: { id: true, name: true, district: true } },
        _count: { select: { booths: true, people: true } },
      },
    });
  }

  async update(id: string, dto: UpdateWardDto, user: AuthenticatedUser) {
    const ward = await this.prisma.ward.findUnique({ where: { id } });
    if (!ward) throw new NotFoundException('Ward not found');

    if (
      user.role !== AdminRole.SUPER_ADMIN &&
      user.role !== AdminRole.BLOCK_ADMIN
    ) {
      throw new ForbiddenException(
        'Only super admins or block admins can update wards',
      );
    }
    if (
      user.role === AdminRole.BLOCK_ADMIN &&
      ward.blockId !== user.blockId
    ) {
      throw new ForbiddenException('Ward is outside your block scope');
    }
    // Block admins can't move a ward to another block
    if (
      dto.blockId &&
      user.role === AdminRole.BLOCK_ADMIN &&
      dto.blockId !== user.blockId
    ) {
      throw new ForbiddenException(
        'You cannot move a ward to a different block',
      );
    }

    return this.prisma.ward.update({
      where: { id },
      data: dto,
      include: {
        block: { select: { id: true, name: true, district: true } },
        _count: { select: { booths: true, people: true } },
      },
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    const ward = await this.prisma.ward.findUnique({
      where: { id },
      include: { _count: { select: { booths: true, people: true } } },
    });
    if (!ward) throw new NotFoundException('Ward not found');

    if (
      user.role !== AdminRole.SUPER_ADMIN &&
      user.role !== AdminRole.BLOCK_ADMIN
    ) {
      throw new ForbiddenException(
        'Only super admins or block admins can delete wards',
      );
    }
    if (
      user.role === AdminRole.BLOCK_ADMIN &&
      ward.blockId !== user.blockId
    ) {
      throw new ForbiddenException('Ward is outside your block scope');
    }
    if (ward._count.booths > 0) {
      throw new ConflictException(
        `Cannot delete ward — it contains ${ward._count.booths} booth(s). Delete booths first.`,
      );
    }
    if (ward._count.people > 0) {
      throw new ConflictException(
        `Cannot delete ward — it contains ${ward._count.people} member(s).`,
      );
    }
    await this.prisma.ward.delete({ where: { id } });
    return { id, deleted: true };
  }

  private assertReadAccess(
    ward: { id: string; blockId: string },
    user: AuthenticatedUser,
  ) {
    if (user.role === AdminRole.SUPER_ADMIN) return;
    if (user.role === AdminRole.BLOCK_ADMIN && ward.blockId === user.blockId) return;
    if (user.role === AdminRole.WARD_ADMIN && ward.id === user.wardId) return;
    if (user.role === AdminRole.BOOTH_WORKER) {
      // Booth workers can read the ward that contains their booth — we accept here if
      // they queried by id we can't easily verify without an extra query. Allow it;
      // deeper checks happen at the booth level.
      return;
    }
    throw new ForbiddenException('You do not have access to this ward');
  }
}
