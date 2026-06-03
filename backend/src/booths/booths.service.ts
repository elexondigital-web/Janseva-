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
import { CreateBoothDto } from './dto/create-booth.dto';
import { UpdateBoothDto } from './dto/update-booth.dto';

@Injectable()
export class BoothsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    user: AuthenticatedUser,
    wardId?: string,
    blockId?: string,
  ) {
    const where: Prisma.BoothWhereInput = {};

    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
        if (wardId) where.wardId = wardId;
        if (blockId) where.ward = { blockId };
        break;
      case AdminRole.BLOCK_ADMIN:
        where.ward = { blockId: user.blockId ?? '__none__' };
        if (wardId) where.wardId = wardId;
        break;
      case AdminRole.WARD_ADMIN:
        where.wardId = user.wardId ?? '__none__';
        break;
      case AdminRole.BOOTH_WORKER:
        where.id = user.boothId ?? '__none__';
        break;
    }

    return this.prisma.booth.findMany({
      where,
      include: {
        ward: {
          select: {
            id: true,
            name: true,
            blockId: true,
            block: { select: { id: true, name: true, district: true } },
          },
        },
        _count: { select: { people: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const booth = await this.prisma.booth.findUnique({
      where: { id },
      include: {
        ward: {
          select: {
            id: true,
            name: true,
            blockId: true,
            block: { select: { id: true, name: true, district: true } },
          },
        },
        _count: { select: { people: true } },
      },
    });
    if (!booth) throw new NotFoundException('Booth not found');
    this.assertReadAccess(booth, user);
    return booth;
  }

  async create(dto: CreateBoothDto, user: AuthenticatedUser) {
    if (user.role === AdminRole.BOOTH_WORKER) {
      throw new ForbiddenException('Booth workers cannot create booths');
    }

    const ward = await this.prisma.ward.findUnique({
      where: { id: dto.wardId },
      select: { id: true, blockId: true },
    });
    if (!ward) throw new BadRequestException('Ward does not exist');

    if (
      user.role === AdminRole.BLOCK_ADMIN &&
      ward.blockId !== user.blockId
    ) {
      throw new ForbiddenException(
        'You can only create booths in wards belonging to your block',
      );
    }
    if (
      user.role === AdminRole.WARD_ADMIN &&
      ward.id !== user.wardId
    ) {
      throw new ForbiddenException(
        'You can only create booths in your own ward',
      );
    }

    const duplicate = await this.prisma.booth.findFirst({
      where: { name: dto.name, wardId: dto.wardId },
    });
    if (duplicate) {
      throw new ConflictException(
        'A booth with this name already exists in this ward',
      );
    }

    return this.prisma.booth.create({
      data: {
        name: dto.name,
        wardId: dto.wardId,
        location: dto.location ?? null,
      },
      include: {
        ward: {
          select: {
            id: true,
            name: true,
            blockId: true,
            block: { select: { id: true, name: true, district: true } },
          },
        },
        _count: { select: { people: true } },
      },
    });
  }

  async update(id: string, dto: UpdateBoothDto, user: AuthenticatedUser) {
    const booth = await this.prisma.booth.findUnique({
      where: { id },
      include: { ward: { select: { blockId: true } } },
    });
    if (!booth) throw new NotFoundException('Booth not found');

    this.assertWriteAccess(booth, user);

    // If moving to another ward, check write access on the new ward too
    if (dto.wardId && dto.wardId !== booth.wardId) {
      const newWard = await this.prisma.ward.findUnique({
        where: { id: dto.wardId },
        select: { id: true, blockId: true },
      });
      if (!newWard) throw new BadRequestException('Target ward does not exist');
      if (
        user.role === AdminRole.BLOCK_ADMIN &&
        newWard.blockId !== user.blockId
      ) {
        throw new ForbiddenException(
          'Target ward is outside your block scope',
        );
      }
      if (
        user.role === AdminRole.WARD_ADMIN &&
        newWard.id !== user.wardId
      ) {
        throw new ForbiddenException(
          'You cannot move a booth to a different ward',
        );
      }
    }

    return this.prisma.booth.update({
      where: { id },
      data: dto,
      include: {
        ward: {
          select: {
            id: true,
            name: true,
            blockId: true,
            block: { select: { id: true, name: true, district: true } },
          },
        },
        _count: { select: { people: true } },
      },
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    const booth = await this.prisma.booth.findUnique({
      where: { id },
      include: {
        ward: { select: { blockId: true } },
        _count: { select: { people: true } },
      },
    });
    if (!booth) throw new NotFoundException('Booth not found');
    this.assertWriteAccess(booth, user);

    if (booth._count.people > 0) {
      throw new ConflictException(
        `Cannot delete booth — it contains ${booth._count.people} member(s).`,
      );
    }
    await this.prisma.booth.delete({ where: { id } });
    return { id, deleted: true };
  }

  private assertReadAccess(
    booth: { id: string; wardId: string; ward: { blockId: string } },
    user: AuthenticatedUser,
  ) {
    if (user.role === AdminRole.SUPER_ADMIN) return;
    if (
      user.role === AdminRole.BLOCK_ADMIN &&
      booth.ward.blockId === user.blockId
    )
      return;
    if (
      user.role === AdminRole.WARD_ADMIN &&
      booth.wardId === user.wardId
    )
      return;
    if (
      user.role === AdminRole.BOOTH_WORKER &&
      booth.id === user.boothId
    )
      return;
    throw new ForbiddenException('You do not have access to this booth');
  }

  private assertWriteAccess(
    booth: { id: string; wardId: string; ward: { blockId: string } },
    user: AuthenticatedUser,
  ) {
    if (user.role === AdminRole.SUPER_ADMIN) return;
    if (
      user.role === AdminRole.BLOCK_ADMIN &&
      booth.ward.blockId === user.blockId
    )
      return;
    if (
      user.role === AdminRole.WARD_ADMIN &&
      booth.wardId === user.wardId
    )
      return;
    throw new ForbiddenException(
      'You do not have write access to this booth',
    );
  }
}
