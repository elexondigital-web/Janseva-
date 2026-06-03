import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';

@Injectable()
export class BlocksService {
  constructor(private prisma: PrismaService) {}

  /** List all blocks the user can see. SUPER_ADMIN sees everything; others see only their own block. */
  async findAll(user: AuthenticatedUser) {
    const where =
      user.role === AdminRole.SUPER_ADMIN
        ? {}
        : { id: user.blockId ?? '__none__' };

    return this.prisma.block.findMany({
      where,
      include: {
        _count: {
          select: { wards: true, people: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const block = await this.prisma.block.findUnique({
      where: { id },
      include: {
        wards: {
          include: {
            _count: { select: { booths: true, people: true } },
          },
          orderBy: { name: 'asc' },
        },
        _count: { select: { wards: true, people: true } },
      },
    });
    if (!block) {
      throw new NotFoundException('Block not found');
    }
    if (user.role !== AdminRole.SUPER_ADMIN && block.id !== user.blockId) {
      throw new ForbiddenException('You do not have access to this block');
    }
    return block;
  }

  /** Only SUPER_ADMIN can create blocks. */
  async create(dto: CreateBlockDto, user: AuthenticatedUser) {
    if (user.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can create blocks');
    }

    const existing = await this.prisma.block.findFirst({
      where: { name: dto.name, district: dto.district },
    });
    if (existing) {
      throw new ConflictException(
        'A block with the same name already exists in this district',
      );
    }

    return this.prisma.block.create({
      data: {
        name: dto.name,
        district: dto.district,
        state: dto.state ?? 'Punjab',
      },
    });
  }

  /** Only SUPER_ADMIN can update blocks. */
  async update(id: string, dto: UpdateBlockDto, user: AuthenticatedUser) {
    if (user.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can update blocks');
    }
    const block = await this.prisma.block.findUnique({ where: { id } });
    if (!block) throw new NotFoundException('Block not found');

    return this.prisma.block.update({
      where: { id },
      data: dto,
    });
  }

  /** Only SUPER_ADMIN can delete blocks. Blocks with wards cannot be deleted. */
  async remove(id: string, user: AuthenticatedUser) {
    if (user.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can delete blocks');
    }
    const block = await this.prisma.block.findUnique({
      where: { id },
      include: { _count: { select: { wards: true, people: true } } },
    });
    if (!block) throw new NotFoundException('Block not found');
    if (block._count.wards > 0) {
      throw new ConflictException(
        `Cannot delete block — it contains ${block._count.wards} ward(s). Delete wards first.`,
      );
    }
    if (block._count.people > 0) {
      throw new ConflictException(
        `Cannot delete block — it contains ${block._count.people} member(s).`,
      );
    }
    await this.prisma.block.delete({ where: { id } });
    return { id, deleted: true };
  }
}
