import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  AdminRole,
  Category,
  Gender,
  Status,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types';
import { TtlCache } from './cache';

// Public response shapes — these mirror what Reports.tsx consumes.
export interface OverviewReport {
  totalMembers: number;
  activeMembers: number;
  pendingMembers: number;
  totalWards: number;
  totalBooths: number;
  newThisMonth: number;
  newLastMonth: number;
  growthPercent: number;
  messagesThisMonth: number;
  activeBoothWorkers: number;
  avgAttendancePercent: number;
}

export interface AttendanceTrendItem {
  eventId: string;
  eventName: string;
  date: string;
  attended: number;
  invited: number;
  turnout: number;
}

export interface DemographicsReport {
  gender: Record<Gender, number>;
  age: { '18-35': number; '36-55': number; '55+': number; unknown: number };
  category: Record<Category, number>;
  status: Record<Status, number>;
}

export interface WardPerformanceItem {
  wardId: string;
  wardName: string;
  members: number;
  avgAttendance: number;
  lastEventAttendance: number;
  trend: 'up' | 'down' | 'flat';
}

export interface TopMemberItem {
  personId: string;
  uniqueId: string;
  fullName: string;
  photoUrl: string | null;
  wardName: string | null;
  boothName: string | null;
  attendedEvents: number;
  totalEvents: number;
  attendanceRate: number;
}

@Injectable()
export class ReportsService {
  private cache: TtlCache<unknown>;

  constructor(private prisma: PrismaService) {
    const ttl = Number(process.env.REPORTS_CACHE_TTL_MS ?? 300000);
    this.cache = new TtlCache<unknown>(ttl > 0 ? ttl : 1);
  }

  // ----- scope helpers ----------------------------------------------------

  /**
   * SUPER_ADMIN may pass any blockId; lower roles must use their own.
   *
   * For SUPER_ADMIN with no blockId, fall back to the only block in the
   * system if there's exactly one — this keeps the Reports page usable
   * out-of-the-box on a single-block deployment without forcing the
   * frontend to mint a block picker. Multi-block installs still throw
   * to force an explicit choice.
   */
  private async effectiveBlockId(
    user: AuthenticatedUser,
    requested?: string,
  ): Promise<string> {
    if (user.role === AdminRole.SUPER_ADMIN) {
      if (requested) return requested;
      const blocks = await this.prisma.block.findMany({
        select: { id: true },
        take: 2,
      });
      if (blocks.length === 1) return blocks[0].id;
      throw new BadRequestException(
        'blockId is required for SUPER_ADMIN when more than one block exists',
      );
    }
    if (!user.blockId)
      throw new ForbiddenException('Account has no block assigned');
    if (requested && requested !== user.blockId)
      throw new ForbiddenException('Cannot view reports outside your block');
    return user.blockId;
  }

  private cacheKey(prefix: string, blockId: string, extra?: string): string {
    return extra ? `${prefix}:${blockId}:${extra}` : `${prefix}:${blockId}`;
  }

  // ----- Overview ---------------------------------------------------------

  async overview(user: AuthenticatedUser, blockId?: string) {
    const eff = await this.effectiveBlockId(user, blockId);
    return this.cache.wrap(
      this.cacheKey('overview', eff),
      () => this.buildOverview(eff),
    ) as Promise<OverviewReport>;
  }

  private async buildOverview(blockId: string): Promise<OverviewReport> {
    const now = new Date();
    const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endLast = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      totalMembers,
      activeMembers,
      pendingMembers,
      totalWards,
      totalBooths,
      newThisMonth,
      newLastMonth,
      messagesThisMonth,
      activeBoothWorkers,
    ] = await Promise.all([
      this.prisma.person.count({ where: { blockId } }),
      this.prisma.person.count({ where: { blockId, status: Status.ACTIVE } }),
      this.prisma.person.count({ where: { blockId, status: Status.PENDING } }),
      this.prisma.ward.count({ where: { blockId } }),
      this.prisma.booth.count({ where: { ward: { blockId } } }),
      this.prisma.person.count({
        where: { blockId, createdAt: { gte: startThis } },
      }),
      this.prisma.person.count({
        where: {
          blockId,
          createdAt: { gte: startLast, lte: endLast },
        },
      }),
      this.prisma.message.count({
        where: { blockId, sentAt: { gte: startThis } },
      }),
      this.prisma.admin.count({
        where: {
          blockId,
          role: AdminRole.BOOTH_WORKER,
          isActive: true,
        },
      }),
    ]);

    // Average attendance % across the last 6 events.
    const avgAttendancePercent = await this.computeAvgAttendance(blockId, 6);

    const growthPercent =
      newLastMonth === 0
        ? newThisMonth > 0
          ? 100
          : 0
        : Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 1000) /
          10;

    return {
      totalMembers,
      activeMembers,
      pendingMembers,
      totalWards,
      totalBooths,
      newThisMonth,
      newLastMonth,
      growthPercent,
      messagesThisMonth,
      activeBoothWorkers,
      avgAttendancePercent,
    };
  }

  private async computeAvgAttendance(
    blockId: string,
    limit: number,
  ): Promise<number> {
    const events = await this.prisma.event.findMany({
      where: { blockId },
      orderBy: { date: 'desc' },
      take: limit,
      select: {
        id: true,
        wardId: true,
        boothId: true,
        _count: { select: { attendances: true } },
      },
    });

    if (events.length === 0) return 0;

    let sum = 0;
    let count = 0;
    for (const ev of events) {
      const where: Prisma.PersonWhereInput = { blockId };
      if (ev.wardId) where.wardId = ev.wardId;
      if (ev.boothId) where.boothId = ev.boothId;
      const expected = await this.prisma.person.count({ where });
      if (expected > 0) {
        sum += (ev._count.attendances / expected) * 100;
        count++;
      }
    }
    return count === 0 ? 0 : Math.round((sum / count) * 10) / 10;
  }

  // ----- Attendance trend -------------------------------------------------

  async attendance(user: AuthenticatedUser, blockId?: string, limit = 6) {
    const eff = await this.effectiveBlockId(user, blockId);
    return this.cache.wrap(
      this.cacheKey('attendance', eff, `lim=${limit}`),
      () => this.buildAttendance(eff, limit),
    ) as Promise<AttendanceTrendItem[]>;
  }

  private async buildAttendance(
    blockId: string,
    limit: number,
  ): Promise<AttendanceTrendItem[]> {
    const events = await this.prisma.event.findMany({
      where: { blockId },
      orderBy: { date: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        date: true,
        wardId: true,
        boothId: true,
        _count: { select: { attendances: true } },
      },
    });

    const out: AttendanceTrendItem[] = [];
    for (const ev of events) {
      const where: Prisma.PersonWhereInput = { blockId };
      if (ev.wardId) where.wardId = ev.wardId;
      if (ev.boothId) where.boothId = ev.boothId;
      const invited = await this.prisma.person.count({ where });
      const attended = ev._count.attendances;
      out.push({
        eventId: ev.id,
        eventName: ev.name,
        date: ev.date.toISOString(),
        attended,
        invited,
        turnout:
          invited === 0
            ? 0
            : Math.round((attended / invited) * 1000) / 10,
      });
    }
    // Reverse so the chart reads left-to-right oldest → newest.
    return out.reverse();
  }

  // ----- Demographics -----------------------------------------------------

  async demographics(user: AuthenticatedUser, blockId?: string) {
    const eff = await this.effectiveBlockId(user, blockId);
    return this.cache.wrap(
      this.cacheKey('demographics', eff),
      () => this.buildDemographics(eff),
    ) as Promise<DemographicsReport>;
  }

  private async buildDemographics(blockId: string): Promise<DemographicsReport> {
    // Counts via groupBy keep the DB doing the work.
    const [byGender, byCategory, byStatus] = await Promise.all([
      this.prisma.person.groupBy({
        by: ['gender'],
        where: { blockId },
        _count: { _all: true },
      }),
      this.prisma.person.groupBy({
        by: ['category'],
        where: { blockId },
        _count: { _all: true },
      }),
      this.prisma.person.groupBy({
        by: ['status'],
        where: { blockId },
        _count: { _all: true },
      }),
    ]);

    // Age buckets via raw SQL (Prisma can't easily do CASE+GROUP).
    const ageRows = await this.prisma.$queryRaw<
      { bucket: string; count: bigint }[]
    >`
      SELECT
        CASE
          WHEN dob IS NULL THEN 'unknown'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob))::int BETWEEN 18 AND 35
            THEN '18-35'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob))::int BETWEEN 36 AND 55
            THEN '36-55'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob))::int > 55
            THEN '55+'
          ELSE 'unknown'
        END AS bucket,
        COUNT(*)::bigint AS count
      FROM "Person"
      WHERE "blockId" = ${blockId}
      GROUP BY bucket
    `;

    const gender: Record<Gender, number> = {
      MALE: 0,
      FEMALE: 0,
      OTHER: 0,
    };
    for (const r of byGender) gender[r.gender] = r._count._all;

    const category: Record<Category, number> = {
      GENERAL: 0,
      OBC: 0,
      SC: 0,
      ST: 0,
    };
    for (const r of byCategory) category[r.category] = r._count._all;

    const status: Record<Status, number> = {
      ACTIVE: 0,
      INACTIVE: 0,
      PENDING: 0,
    };
    for (const r of byStatus) status[r.status] = r._count._all;

    const age = { '18-35': 0, '36-55': 0, '55+': 0, unknown: 0 };
    for (const r of ageRows) {
      if (r.bucket === '18-35') age['18-35'] = Number(r.count);
      else if (r.bucket === '36-55') age['36-55'] = Number(r.count);
      else if (r.bucket === '55+') age['55+'] = Number(r.count);
      else age.unknown = Number(r.count);
    }

    return { gender, age, category, status };
  }

  // ----- Ward performance -------------------------------------------------

  async wardPerformance(user: AuthenticatedUser, blockId?: string) {
    const eff = await this.effectiveBlockId(user, blockId);
    return this.cache.wrap(
      this.cacheKey('wardperf', eff),
      () => this.buildWardPerformance(eff),
    ) as Promise<WardPerformanceItem[]>;
  }

  private async buildWardPerformance(
    blockId: string,
  ): Promise<WardPerformanceItem[]> {
    const wards = await this.prisma.ward.findMany({
      where: { blockId },
      select: {
        id: true,
        name: true,
        _count: { select: { people: true } },
      },
    });

    const out: WardPerformanceItem[] = [];
    for (const w of wards) {
      // Last 6 events that hit this ward (block-level events count too).
      const events = await this.prisma.event.findMany({
        where: {
          blockId,
          OR: [{ wardId: w.id }, { wardId: null }],
        },
        orderBy: { date: 'desc' },
        take: 6,
        select: {
          id: true,
          date: true,
          wardId: true,
          boothId: true,
        },
      });

      const turnouts: number[] = [];
      let lastEventTurnout = 0;

      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const personWhere: Prisma.PersonWhereInput = {
          blockId,
          wardId: w.id,
        };
        if (ev.boothId) personWhere.boothId = ev.boothId;
        const expected = await this.prisma.person.count({ where: personWhere });
        const attended = await this.prisma.attendance.count({
          where: {
            eventId: ev.id,
            person: { wardId: w.id },
          },
        });
        const t = expected === 0 ? 0 : (attended / expected) * 100;
        turnouts.push(t);
        if (i === 0) lastEventTurnout = t;
      }

      const avg =
        turnouts.length === 0
          ? 0
          : turnouts.reduce((a, b) => a + b, 0) / turnouts.length;

      // Trend: compare last event to the average of the prior 5 (if any).
      let trend: 'up' | 'down' | 'flat' = 'flat';
      if (turnouts.length >= 2) {
        const prior = turnouts.slice(1);
        const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
        const delta = lastEventTurnout - priorAvg;
        if (delta > 2) trend = 'up';
        else if (delta < -2) trend = 'down';
      }

      out.push({
        wardId: w.id,
        wardName: w.name,
        members: w._count.people,
        avgAttendance: Math.round(avg * 10) / 10,
        lastEventAttendance: Math.round(lastEventTurnout * 10) / 10,
        trend,
      });
    }

    out.sort((a, b) => b.avgAttendance - a.avgAttendance);
    return out;
  }

  // ----- Top members ------------------------------------------------------

  async topMembers(user: AuthenticatedUser, blockId?: string, limit = 10) {
    const eff = await this.effectiveBlockId(user, blockId);
    return this.cache.wrap(
      this.cacheKey('topmembers', eff, `lim=${limit}`),
      () => this.buildTopMembers(eff, limit),
    ) as Promise<TopMemberItem[]>;
  }

  private async buildTopMembers(
    blockId: string,
    limit: number,
  ): Promise<TopMemberItem[]> {
    // Total events available to the block — used as the denominator.
    const totalEvents = await this.prisma.event.count({ where: { blockId } });

    if (totalEvents === 0) return [];

    // Raw query because Prisma's groupBy can't return joined fields cleanly.
    const rows = await this.prisma.$queryRaw<
      {
        personId: string;
        attendedEvents: bigint;
      }[]
    >`
      SELECT a."personId" AS "personId", COUNT(*)::bigint AS "attendedEvents"
        FROM "Attendance" a
        JOIN "Event" e ON e.id = a."eventId"
        JOIN "Person" p ON p.id = a."personId"
       WHERE e."blockId" = ${blockId}
         AND p."blockId" = ${blockId}
       GROUP BY a."personId"
       ORDER BY COUNT(*) DESC
       LIMIT ${limit}
    `;

    if (rows.length === 0) return [];

    const personMap = new Map(
      (
        await this.prisma.person.findMany({
          where: { id: { in: rows.map((r) => r.personId) } },
          select: {
            id: true,
            uniqueId: true,
            fullName: true,
            photoUrl: true,
            ward: { select: { name: true } },
            booth: { select: { name: true } },
          },
        })
      ).map((p) => [p.id, p]),
    );

    return rows.map((r) => {
      const p = personMap.get(r.personId);
      const attendedEvents = Number(r.attendedEvents);
      return {
        personId: r.personId,
        uniqueId: p?.uniqueId ?? '',
        fullName: p?.fullName ?? '(unknown)',
        photoUrl: p?.photoUrl ?? null,
        wardName: p?.ward?.name ?? null,
        boothName: p?.booth?.name ?? null,
        attendedEvents,
        totalEvents,
        attendanceRate:
          Math.round((attendedEvents / totalEvents) * 1000) / 10,
      };
    });
  }
}
