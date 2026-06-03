import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, AdminRole, AttendanceMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { MarkQrDto } from './dto/mark-qr.dto';
import { MarkManualDto } from './dto/mark-manual.dto';
import { MarkFingerprintDto } from './dto/mark-fingerprint.dto';
import { AuthenticatedUser } from '../auth/types';

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Can this user read (view/list) attendance for this event? */
  private async assertEventReadScope(eventId: string, user: AuthenticatedUser) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
        return event;
      case AdminRole.BLOCK_ADMIN:
        if (event.blockId !== user.blockId)
          throw new ForbiddenException('Event is outside your block');
        return event;
      case AdminRole.WARD_ADMIN:
        if (event.blockId !== user.blockId)
          throw new ForbiddenException('Event is outside your block');
        if (event.wardId && event.wardId !== user.wardId)
          throw new ForbiddenException('Event is outside your ward');
        return event;
      case AdminRole.BOOTH_WORKER:
        if (event.blockId !== user.blockId)
          throw new ForbiddenException('Event is outside your block');
        if (event.wardId && event.wardId !== user.wardId)
          throw new ForbiddenException('Event is outside your ward');
        if (event.boothId && event.boothId !== user.boothId)
          throw new ForbiddenException('Event is outside your booth');
        return event;
    }
  }

  /** Can this user record attendance for this (event, person)? */
  private assertPersonWithinEvent(
    event: { blockId: string; wardId: string | null; boothId: string | null },
    person: { blockId: string; wardId: string; boothId: string },
  ) {
    if (person.blockId !== event.blockId)
      throw new BadRequestException('Person is not in this event’s block');
    if (event.wardId && person.wardId !== event.wardId)
      throw new BadRequestException('Person is not in this event’s ward');
    if (event.boothId && person.boothId !== event.boothId)
      throw new BadRequestException('Person is not in this event’s booth');
  }

  /**
   * Resolve the qrData string into a Person record. Accepts:
   *   - JSON `{id, uniqueId, name}` from our own generator
   *   - a uniqueCardId like `CARD-JS-000001`
   *   - a bare uniqueId like `JS-000001`
   */
  private async resolveQrToPerson(qrData: string) {
    const trimmed = qrData.trim();

    // Try JSON first
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as {
          id?: string;
          uniqueId?: string;
          name?: string;
        };
        if (parsed.id) {
          const p = await this.prisma.person.findUnique({
            where: { id: parsed.id },
          });
          if (p) return p;
        }
        if (parsed.uniqueId) {
          const p = await this.prisma.person.findUnique({
            where: { uniqueId: parsed.uniqueId },
          });
          if (p) return p;
        }
      } catch {
        // fall through
      }
    }

    // `CARD-JS-000001` → look up via IDCard.uniqueCardId
    if (/^CARD-/i.test(trimmed)) {
      const card = await this.prisma.iDCard.findUnique({
        where: { uniqueCardId: trimmed.toUpperCase() },
        include: { person: true },
      });
      if (!card) throw new NotFoundException('No card matches this QR code');
      if (!card.isActive)
        throw new BadRequestException('Card has been revoked');
      return card.person;
    }

    // Bare uniqueId like `JS-000001`
    if (/^JS-\d+/i.test(trimmed)) {
      const p = await this.prisma.person.findUnique({
        where: { uniqueId: trimmed.toUpperCase() },
      });
      if (p) return p;
    }

    throw new BadRequestException('QR code is not recognised');
  }

  async markQr(dto: MarkQrDto, user: AuthenticatedUser) {
    const event = await this.assertEventReadScope(dto.eventId, user);
    const person = await this.resolveQrToPerson(dto.qrData);

    this.assertPersonWithinEvent(event, {
      blockId: person.blockId,
      wardId: person.wardId,
      boothId: person.boothId,
    });

    const existing = await this.prisma.attendance.findUnique({
      where: { personId_eventId: { personId: person.id, eventId: event.id } },
    });
    if (existing) {
      return {
        alreadyMarked: true,
        attendance: existing,
        person: {
          id: person.id,
          uniqueId: person.uniqueId,
          fullName: person.fullName,
          photoUrl: person.photoUrl,
          phone: person.phone,
        },
      };
    }

    const attendance = await this.prisma.attendance.create({
      data: {
        personId: person.id,
        eventId: event.id,
        method: AttendanceMethod.QR,
      },
    });

    void this.audit.logForUser(user, AuditAction.MARK_ATTENDANCE, 'Attendance', {
      entityId: attendance.id,
      details: `${person.fullName} (${person.uniqueId}) at ${event.name} via QR`,
    });

    return {
      alreadyMarked: false,
      attendance,
      person: {
        id: person.id,
        uniqueId: person.uniqueId,
        fullName: person.fullName,
        photoUrl: person.photoUrl,
        phone: person.phone,
      },
    };
  }

  /**
   * Phase 3 fingerprint marking. The frontend has already matched the
   * captured template to a person (by querying the local Mantra SDK and
   * comparing against the enrolled template); here we accept either the
   * uniqueId or the cuid and just verify scope, then create the record.
   *
   * Idempotent like markQr: a duplicate scan returns alreadyMarked: true
   * instead of throwing 409. This matters for the auto-capture loop in
   * the Attendance UI which can fire twice on a single placement.
   */
  async markFingerprint(dto: MarkFingerprintDto, user: AuthenticatedUser) {
    if (!dto.uniqueId && !dto.personId) {
      throw new BadRequestException(
        'fingerprint mark requires uniqueId or personId',
      );
    }

    const event = await this.assertEventReadScope(dto.eventId, user);

    const person = dto.personId
      ? await this.prisma.person.findUnique({ where: { id: dto.personId } })
      : await this.prisma.person.findUnique({
          where: { uniqueId: dto.uniqueId!.toUpperCase() },
        });

    if (!person) throw new NotFoundException('Member not found');

    this.assertPersonWithinEvent(event, {
      blockId: person.blockId,
      wardId: person.wardId,
      boothId: person.boothId,
    });

    const existing = await this.prisma.attendance.findUnique({
      where: { personId_eventId: { personId: person.id, eventId: event.id } },
    });
    if (existing) {
      return {
        alreadyMarked: true,
        attendance: existing,
        person: {
          id: person.id,
          uniqueId: person.uniqueId,
          fullName: person.fullName,
          photoUrl: person.photoUrl,
          phone: person.phone,
        },
      };
    }

    const attendance = await this.prisma.attendance.create({
      data: {
        personId: person.id,
        eventId: event.id,
        method: AttendanceMethod.FINGERPRINT,
      },
    });

    void this.audit.logForUser(user, AuditAction.MARK_ATTENDANCE, 'Attendance', {
      entityId: attendance.id,
      details: `${person.fullName} (${person.uniqueId}) at ${event.name} via fingerprint`,
    });

    return {
      alreadyMarked: false,
      attendance,
      person: {
        id: person.id,
        uniqueId: person.uniqueId,
        fullName: person.fullName,
        photoUrl: person.photoUrl,
        phone: person.phone,
      },
    };
  }

  async markManual(dto: MarkManualDto, user: AuthenticatedUser) {
    const event = await this.assertEventReadScope(dto.eventId, user);
    const person = await this.prisma.person.findUnique({
      where: { id: dto.personId },
    });
    if (!person) throw new NotFoundException(`Person ${dto.personId} not found`);

    this.assertPersonWithinEvent(event, {
      blockId: person.blockId,
      wardId: person.wardId,
      boothId: person.boothId,
    });

    const existing = await this.prisma.attendance.findUnique({
      where: { personId_eventId: { personId: person.id, eventId: event.id } },
    });
    if (existing) {
      throw new ConflictException('Person is already marked present');
    }

    const attendance = await this.prisma.attendance.create({
      data: {
        personId: person.id,
        eventId: event.id,
        method: dto.method ?? AttendanceMethod.MANUAL,
      },
    });

    void this.audit.logForUser(user, AuditAction.MARK_ATTENDANCE, 'Attendance', {
      entityId: attendance.id,
      details: `${person.fullName} (${person.uniqueId}) at ${event.name} via manual`,
    });

    return {
      attendance,
      person: {
        id: person.id,
        uniqueId: person.uniqueId,
        fullName: person.fullName,
        photoUrl: person.photoUrl,
        phone: person.phone,
      },
    };
  }

  async unmark(eventId: string, personId: string, user: AuthenticatedUser) {
    await this.assertEventReadScope(eventId, user);

    const existing = await this.prisma.attendance.findUnique({
      where: { personId_eventId: { personId, eventId } },
    });
    if (!existing) throw new NotFoundException('Attendance record not found');

    await this.prisma.attendance.delete({
      where: { personId_eventId: { personId, eventId } },
    });

    void this.audit.logForUser(user, AuditAction.UNMARK_ATTENDANCE, 'Attendance', {
      entityId: existing.id,
      details: `personId=${personId} eventId=${eventId}`,
    });

    return { deleted: true };
  }

  /** Paginated list of attendees for an event. */
  async listForEvent(
    eventId: string,
    user: AuthenticatedUser,
    opts: { page?: number; limit?: number } = {},
  ) {
    await this.assertEventReadScope(eventId, user);
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 50;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where: { eventId },
        skip,
        take: limit,
        orderBy: { markedAt: 'desc' },
        include: {
          person: {
            select: {
              id: true,
              uniqueId: true,
              fullName: true,
              photoUrl: true,
              phone: true,
              ward: { select: { id: true, name: true } },
              booth: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.attendance.count({ where: { eventId } }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Stats for an event:
   *   - expected: # of eligible people in this event's scope
   *   - present: # of attendance records
   *   - percentage
   *   - byWard: breakdown of present attendees by ward
   *   - byBooth: breakdown of present attendees by booth
   *   - byMethod: QR vs FINGERPRINT vs MANUAL
   */
  async statsForEvent(eventId: string, user: AuthenticatedUser) {
    const event = await this.assertEventReadScope(eventId, user);

    // expected = person count in same block/ward/booth scope as event
    const personWhere: Prisma.PersonWhereInput = {
      blockId: event.blockId,
      ...(event.wardId ? { wardId: event.wardId } : {}),
      ...(event.boothId ? { boothId: event.boothId } : {}),
    };
    const expected = await this.prisma.person.count({ where: personWhere });

    const present = await this.prisma.attendance.count({
      where: { eventId: event.id },
    });

    const [byMethodQr, byMethodFp, byMethodManual] = await Promise.all([
      this.prisma.attendance.count({
        where: { eventId: event.id, method: AttendanceMethod.QR },
      }),
      this.prisma.attendance.count({
        where: { eventId: event.id, method: AttendanceMethod.FINGERPRINT },
      }),
      this.prisma.attendance.count({
        where: { eventId: event.id, method: AttendanceMethod.MANUAL },
      }),
    ]);

    // Breakdown by ward + booth for this event's attendees.
    const byWardRows = await this.prisma.$queryRaw<
      { wardId: string; wardName: string | null; count: bigint }[]
    >`
      SELECT p."wardId" as "wardId", w."name" as "wardName", COUNT(*)::bigint as count
        FROM "Attendance" a
        JOIN "Person" p ON p.id = a."personId"
        LEFT JOIN "Ward" w ON w.id = p."wardId"
       WHERE a."eventId" = ${event.id}
       GROUP BY p."wardId", w."name"
       ORDER BY count DESC
    `;

    const byBoothRows = await this.prisma.$queryRaw<
      { boothId: string; boothName: string | null; count: bigint }[]
    >`
      SELECT p."boothId" as "boothId", b."name" as "boothName", COUNT(*)::bigint as count
        FROM "Attendance" a
        JOIN "Person" p ON p.id = a."personId"
        LEFT JOIN "Booth" b ON b.id = p."boothId"
       WHERE a."eventId" = ${event.id}
       GROUP BY p."boothId", b."name"
       ORDER BY count DESC
       LIMIT 20
    `;

    return {
      event: {
        id: event.id,
        name: event.name,
        date: event.date,
        type: event.type,
      },
      expected,
      present,
      absent: Math.max(0, expected - present),
      percentage: expected === 0 ? 0 : Math.round((present / expected) * 100),
      byMethod: {
        QR: byMethodQr,
        FINGERPRINT: byMethodFp,
        MANUAL: byMethodManual,
      },
      byWard: byWardRows.map((r) => ({
        wardId: r.wardId,
        wardName: r.wardName,
        count: Number(r.count),
      })),
      byBooth: byBoothRows.map((r) => ({
        boothId: r.boothId,
        boothName: r.boothName,
        count: Number(r.count),
      })),
    };
  }

  /** Attendance history for a single person — used on PersonDetail. */
  async listForPerson(
    personId: string,
    user: AuthenticatedUser,
    opts: { page?: number; limit?: number } = {},
  ) {
    // Person scope check
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
    });
    if (!person) throw new NotFoundException(`Person ${personId} not found`);

    switch (user.role) {
      case AdminRole.BLOCK_ADMIN:
        if (person.blockId !== user.blockId)
          throw new ForbiddenException('Out of block scope');
        break;
      case AdminRole.WARD_ADMIN:
        if (person.wardId !== user.wardId)
          throw new ForbiddenException('Out of ward scope');
        break;
      case AdminRole.BOOTH_WORKER:
        if (person.boothId !== user.boothId)
          throw new ForbiddenException('Out of booth scope');
        break;
      default:
        break;
    }

    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where: { personId },
        skip,
        take: limit,
        orderBy: { markedAt: 'desc' },
        include: {
          event: {
            select: {
              id: true,
              name: true,
              date: true,
              type: true,
              location: true,
            },
          },
        },
      }),
      this.prisma.attendance.count({ where: { personId } }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
