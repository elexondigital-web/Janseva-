import { Injectable } from '@nestjs/common';
import { AdminRole, Prisma, Gender, PartyRole, Status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private personScope(user: AuthenticatedUser): Prisma.PersonWhereInput {
    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
        return {};
      case AdminRole.BLOCK_ADMIN:
        return { blockId: user.blockId ?? '__none__' };
      case AdminRole.WARD_ADMIN:
        return { wardId: user.wardId ?? '__none__' };
      case AdminRole.BOOTH_WORKER:
        return { boothId: user.boothId ?? '__none__' };
    }
  }

  private wardScope(user: AuthenticatedUser): Prisma.WardWhereInput {
    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
        return {};
      case AdminRole.BLOCK_ADMIN:
        return { blockId: user.blockId ?? '__none__' };
      case AdminRole.WARD_ADMIN:
        return { id: user.wardId ?? '__none__' };
      case AdminRole.BOOTH_WORKER:
        return { booths: { some: { id: user.boothId ?? '__none__' } } };
    }
  }

  private boothScope(user: AuthenticatedUser): Prisma.BoothWhereInput {
    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
        return {};
      case AdminRole.BLOCK_ADMIN:
        return { ward: { blockId: user.blockId ?? '__none__' } };
      case AdminRole.WARD_ADMIN:
        return { wardId: user.wardId ?? '__none__' };
      case AdminRole.BOOTH_WORKER:
        return { id: user.boothId ?? '__none__' };
    }
  }

  private blockScope(user: AuthenticatedUser): Prisma.BlockWhereInput {
    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
        return {};
      case AdminRole.BLOCK_ADMIN:
      case AdminRole.WARD_ADMIN:
      case AdminRole.BOOTH_WORKER:
        return { id: user.blockId ?? '__none__' };
    }
  }

  async getStats(user: AuthenticatedUser) {
    const personWhere = this.personScope(user);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const countPeople = (extra: Prisma.PersonWhereInput) =>
      this.prisma.person.count({ where: { ...personWhere, ...extra } });

    const [
      totalMembers,
      activeMembers,
      inactiveMembers,
      pendingMembers,
      maleCount,
      femaleCount,
      otherCount,
      memberRoleCount,
      boothWorkerCount,
      wardAdminCount,
      blockAdminCount,
      newThisMonth,
      newLast30Days,
      withIdCard,
    ] = await Promise.all([
      this.prisma.person.count({ where: personWhere }),
      countPeople({ status: Status.ACTIVE }),
      countPeople({ status: Status.INACTIVE }),
      countPeople({ status: Status.PENDING }),
      countPeople({ gender: Gender.MALE }),
      countPeople({ gender: Gender.FEMALE }),
      countPeople({ gender: Gender.OTHER }),
      countPeople({ role: PartyRole.MEMBER }),
      countPeople({ role: PartyRole.BOOTH_WORKER }),
      countPeople({ role: PartyRole.WARD_ADMIN }),
      countPeople({ role: PartyRole.BLOCK_ADMIN }),
      countPeople({ createdAt: { gte: firstOfMonth } }),
      countPeople({ createdAt: { gte: thirtyDaysAgo } }),
      countPeople({ idCard: { is: { isActive: true } } }),
    ]);

    const [totalBlocks, totalWards, totalBooths] = await Promise.all([
      this.prisma.block.count({ where: this.blockScope(user) }),
      this.prisma.ward.count({ where: this.wardScope(user) }),
      this.prisma.booth.count({ where: this.boothScope(user) }),
    ]);

    // Recent members
    const recentMembers = await this.prisma.person.findMany({
      where: personWhere,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        uniqueId: true,
        fullName: true,
        phone: true,
        photoUrl: true,
        role: true,
        status: true,
        createdAt: true,
        block: { select: { name: true } },
        ward: { select: { name: true } },
        booth: { select: { name: true } },
      },
    });

    // Top blocks by member count (super admin only, else scoped)
    const blocksRaw = await this.prisma.block.findMany({
      where: this.blockScope(user),
      select: {
        id: true,
        name: true,
        district: true,
        _count: { select: { people: { where: personWhere } } },
      },
      take: 10,
    });
    const topBlocks = blocksRaw
      .map((b) => ({
        id: b.id,
        name: b.name,
        district: b.district,
        count: b._count.people,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totals: {
        totalMembers,
        activeMembers,
        inactiveMembers,
        pendingMembers,
        newThisMonth,
        newLast30Days,
        withIdCard,
        totalBlocks,
        totalWards,
        totalBooths,
      },
      byGender: [
        { label: 'Male', value: maleCount },
        { label: 'Female', value: femaleCount },
        { label: 'Other', value: otherCount },
      ],
      byRole: [
        { label: 'Members', value: memberRoleCount },
        { label: 'Booth Workers', value: boothWorkerCount },
        { label: 'Ward Admins', value: wardAdminCount },
        { label: 'Block Admins', value: blockAdminCount },
      ],
      byStatus: [
        { label: 'Active', value: activeMembers },
        { label: 'Inactive', value: inactiveMembers },
        { label: 'Pending', value: pendingMembers },
      ],
      recentMembers,
      topBlocks,
    };
  }
}
