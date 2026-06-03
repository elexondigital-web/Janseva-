import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, AdminRole, Gender, PartyRole, Status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../uploads/storage.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { ListPeopleDto } from './dto/list-people.dto';
import { SearchPeopleDto } from './dto/search-people.dto';
import { AuthenticatedUser } from '../auth/types';

@Injectable()
export class PeopleService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  /**
   * Phase 4 compliance: Aadhaar must never appear unredacted in list /
   * search responses (which are the bulk-export-friendly endpoints).
   * The single-person detail view keeps full visibility because admins
   * need it to verify identity during one-on-one workflows. Mask format:
   * "XXXXXXXX1234" — last 4 digits exposed.
   */
  private maskAadhaar<T extends { aadhaarNumber: string | null }>(
    row: T,
  ): T {
    if (!row.aadhaarNumber) return row;
    const last4 = row.aadhaarNumber.slice(-4);
    return { ...row, aadhaarNumber: `XXXXXXXX${last4}` };
  }

  private buildScopeWhere(user: AuthenticatedUser): Prisma.PersonWhereInput {
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

  private buildScopeClauseRaw(user: AuthenticatedUser): Prisma.Sql {
    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
        return Prisma.empty;
      case AdminRole.BLOCK_ADMIN:
        return Prisma.sql`AND p."blockId" = ${user.blockId ?? '__none__'}`;
      case AdminRole.WARD_ADMIN:
        return Prisma.sql`AND p."wardId" = ${user.wardId ?? '__none__'}`;
      case AdminRole.BOOTH_WORKER:
        return Prisma.sql`AND p."boothId" = ${user.boothId ?? '__none__'}`;
    }
  }

  private assertWriteScope(user: AuthenticatedUser, target: {
    blockId: string;
    wardId: string;
    boothId: string;
  }): void {
    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
        return;
      case AdminRole.BLOCK_ADMIN:
        if (target.blockId !== user.blockId)
          throw new ForbiddenException('Cannot modify people outside your block');
        return;
      case AdminRole.WARD_ADMIN:
        if (target.wardId !== user.wardId)
          throw new ForbiddenException('Cannot modify people outside your ward');
        return;
      case AdminRole.BOOTH_WORKER:
        if (target.boothId !== user.boothId)
          throw new ForbiddenException('Cannot modify people outside your booth');
        return;
    }
  }

  async findAll(user: AuthenticatedUser, query: ListPeopleDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PersonWhereInput = { ...this.buildScopeWhere(user) };

    if (query.blockId) where.blockId = query.blockId;
    if (query.wardId) where.wardId = query.wardId;
    if (query.boothId) where.boothId = query.boothId;
    if (query.gender) where.gender = query.gender;
    if (query.category) where.category = query.category;
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;

    if (query.search && query.search.trim().length > 0) {
      const s = query.search.trim();
      where.OR = [
        { fullName: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
        { uniqueId: { contains: s, mode: 'insensitive' } },
        { voterId: { contains: s, mode: 'insensitive' } },
        { aadhaarNumber: { contains: s } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.person.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          block: { select: { id: true, name: true } },
          ward: { select: { id: true, name: true } },
          booth: { select: { id: true, name: true } },
          idCard: { select: { id: true, uniqueCardId: true, issuedAt: true } },
        },
      }),
      this.prisma.person.count({ where }),
    ]);

    return {
      items: items.map((p) => this.maskAadhaar(p)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async search(user: AuthenticatedUser, dto: SearchPeopleDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const q = (dto.q ?? '').trim();
    const likePattern = `%${q}%`;

    const scopeClause = this.buildScopeClauseRaw(user);

    // Text match across 6 fields. Combines substring ILIKE (fast, exact
    // partial) with pg_trgm similarity (typo-tolerant fuzzy). The trigram
    // branches are guarded by length >= 3 because shorter strings produce
    // too few trigrams to rank usefully.
    const qFilter = q
      ? Prisma.sql`AND (
          p."fullName" ILIKE ${likePattern} OR
          p.phone ILIKE ${likePattern} OR
          COALESCE(p."aadhaarNumber", '') ILIKE ${likePattern} OR
          COALESCE(p."voterId", '') ILIKE ${likePattern} OR
          COALESCE(p.address, '') ILIKE ${likePattern} OR
          p."uniqueId" ILIKE ${likePattern}
          ${q.length >= 3
            ? Prisma.sql`
                OR word_similarity(${q}, p."fullName") > 0.5
                OR word_similarity(${q}, COALESCE(p.address, '')) > 0.5
              `
            : Prisma.empty}
        )`
      : Prisma.empty;

    const wardFilter = dto.wardId
      ? Prisma.sql`AND p."wardId" = ${dto.wardId}`
      : Prisma.empty;
    const boothFilter = dto.boothId
      ? Prisma.sql`AND p."boothId" = ${dto.boothId}`
      : Prisma.empty;
    const genderFilter = dto.gender
      ? Prisma.sql`AND p.gender::text = ${dto.gender}`
      : Prisma.empty;
    const statusFilter = dto.status
      ? Prisma.sql`AND p.status::text = ${dto.status}`
      : Prisma.empty;
    const ageMinFilter =
      dto.ageMin !== undefined && dto.ageMin !== null
        ? Prisma.sql`AND p.dob IS NOT NULL AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob))::int >= ${dto.ageMin}`
        : Prisma.empty;
    const ageMaxFilter =
      dto.ageMax !== undefined && dto.ageMax !== null
        ? Prisma.sql`AND p.dob IS NOT NULL AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob))::int <= ${dto.ageMax}`
        : Prisma.empty;

    // Trigram similarity ranking — only used when q is non-empty.
    // word_similarity() matches the best substring, so multi-word names and
    // addresses score higher on partial/fuzzy queries.
    const orderBy = q
      ? Prisma.sql`ORDER BY GREATEST(
            word_similarity(${q}, p."fullName"),
            similarity(COALESCE(p.phone, ''), ${q}),
            similarity(COALESCE(p."aadhaarNumber", ''), ${q}),
            similarity(COALESCE(p."voterId", ''), ${q}),
            word_similarity(${q}, COALESCE(p.address, '')),
            similarity(p."uniqueId", ${q})
          ) DESC, p."createdAt" DESC`
      : Prisma.sql`ORDER BY p."createdAt" DESC`;

    // Fetch IDs in ranked order.
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id
        FROM "Person" p
       WHERE 1=1
         ${scopeClause}
         ${qFilter}
         ${wardFilter}
         ${boothFilter}
         ${genderFilter}
         ${statusFilter}
         ${ageMinFilter}
         ${ageMaxFilter}
       ${orderBy}
       LIMIT ${limit} OFFSET ${skip}
    `;

    const countRows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
        FROM "Person" p
       WHERE 1=1
         ${scopeClause}
         ${qFilter}
         ${wardFilter}
         ${boothFilter}
         ${genderFilter}
         ${statusFilter}
         ${ageMinFilter}
         ${ageMaxFilter}
    `;
    const total = Number(countRows[0]?.count ?? 0);

    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      return {
        items: [],
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        query: q,
      };
    }

    const full = await this.prisma.person.findMany({
      where: { id: { in: ids } },
      include: {
        block: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } },
        booth: { select: { id: true, name: true } },
        idCard: { select: { id: true, uniqueCardId: true, issuedAt: true } },
      },
    });
    const byId = new Map(full.map((p) => [p.id, p]));
    const items = rows
      .map((r) => byId.get(r.id)!)
      .filter(Boolean)
      .map((p) => this.maskAadhaar(p));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      query: q,
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const person = await this.prisma.person.findUnique({
      where: { id },
      include: {
        block: { select: { id: true, name: true, district: true } },
        ward: { select: { id: true, name: true } },
        booth: { select: { id: true, name: true, location: true } },
        idCard: true,
      },
    });
    if (!person) throw new NotFoundException(`Person ${id} not found`);

    const scope = this.buildScopeWhere(user);
    const visible = await this.prisma.person.findFirst({
      where: { AND: [{ id }, scope] },
      select: { id: true },
    });
    if (!visible) throw new ForbiddenException('Access denied');

    return person;
  }

  private async generateUniqueId(): Promise<string> {
    const count = await this.prisma.person.count();
    return `JS-${String(count + 1).padStart(6, '0')}`;
  }

  private async assertHierarchyConsistent(
    blockId: string,
    wardId: string,
    boothId: string,
  ): Promise<void> {
    const booth = await this.prisma.booth.findUnique({
      where: { id: boothId },
      include: { ward: true },
    });
    if (!booth) throw new BadRequestException(`Booth ${boothId} does not exist`);
    if (booth.wardId !== wardId)
      throw new BadRequestException('boothId does not belong to wardId');
    if (booth.ward.blockId !== blockId)
      throw new BadRequestException('wardId does not belong to blockId');
  }

  async create(dto: CreatePersonDto, user: AuthenticatedUser) {
    await this.assertHierarchyConsistent(dto.blockId, dto.wardId, dto.boothId);
    this.assertWriteScope(user, {
      blockId: dto.blockId,
      wardId: dto.wardId,
      boothId: dto.boothId,
    });

    if (dto.aadhaarNumber) {
      const existing = await this.prisma.person.findFirst({
        where: { aadhaarNumber: dto.aadhaarNumber },
        select: { id: true },
      });
      if (existing)
        throw new ConflictException('A person with this Aadhaar number already exists');
    }

    const uniqueId = await this.generateUniqueId();

    const person = await this.prisma.person.create({
      data: {
        uniqueId,
        fullName: dto.fullName,
        fatherName: dto.fatherName,
        dob: dto.dob ? new Date(dto.dob) : undefined,
        gender: dto.gender,
        phone: dto.phone,
        whatsapp: dto.whatsapp,
        email: dto.email,
        aadhaarNumber: dto.aadhaarNumber,
        voterId: dto.voterId,
        address: dto.address,
        pincode: dto.pincode,
        occupation: dto.occupation,
        caste: dto.caste,
        category: dto.category,
        photoUrl: dto.photoUrl,
        aadhaarImageUrl: dto.aadhaarImageUrl,
        role: dto.role,
        status: dto.status,
        boothId: dto.boothId,
        wardId: dto.wardId,
        blockId: dto.blockId,
      },
      include: {
        block: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } },
        booth: { select: { id: true, name: true } },
      },
    });

    void this.audit.logForUser(user, AuditAction.CREATE_PERSON, 'Person', {
      entityId: person.id,
      details: `${person.fullName} (${person.uniqueId})`,
    });

    return person;
  }

  async update(id: string, dto: UpdatePersonDto, user: AuthenticatedUser) {
    const existing = await this.prisma.person.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Person ${id} not found`);

    this.assertWriteScope(user, {
      blockId: existing.blockId,
      wardId: existing.wardId,
      boothId: existing.boothId,
    });

    const nextBlockId = dto.blockId ?? existing.blockId;
    const nextWardId = dto.wardId ?? existing.wardId;
    const nextBoothId = dto.boothId ?? existing.boothId;

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

    if (dto.aadhaarNumber && dto.aadhaarNumber !== existing.aadhaarNumber) {
      const dup = await this.prisma.person.findFirst({
        where: { aadhaarNumber: dto.aadhaarNumber, id: { not: id } },
        select: { id: true },
      });
      if (dup) throw new ConflictException('Another person has this Aadhaar number');
    }

    const oldPhotoKey =
      dto.photoUrl !== undefined && dto.photoUrl !== existing.photoUrl
        ? this.storage.extractKeyFromUrl(existing.photoUrl)
        : null;
    const oldAadhaarKey =
      dto.aadhaarImageUrl !== undefined &&
      dto.aadhaarImageUrl !== existing.aadhaarImageUrl
        ? this.storage.extractKeyFromUrl(existing.aadhaarImageUrl)
        : null;

    const updated = await this.prisma.person.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        fatherName: dto.fatherName,
        dob: dto.dob ? new Date(dto.dob) : undefined,
        gender: dto.gender,
        phone: dto.phone,
        whatsapp: dto.whatsapp,
        email: dto.email,
        aadhaarNumber: dto.aadhaarNumber,
        voterId: dto.voterId,
        address: dto.address,
        pincode: dto.pincode,
        occupation: dto.occupation,
        caste: dto.caste,
        category: dto.category,
        photoUrl: dto.photoUrl,
        aadhaarImageUrl: dto.aadhaarImageUrl,
        role: dto.role,
        status: dto.status,
        blockId: dto.blockId,
        wardId: dto.wardId,
        boothId: dto.boothId,
      },
      include: {
        block: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } },
        booth: { select: { id: true, name: true } },
        idCard: true,
      },
    });

    if (oldPhotoKey) await this.storage.remove(oldPhotoKey);
    if (oldAadhaarKey) await this.storage.remove(oldAadhaarKey);

    void this.audit.logForUser(user, AuditAction.UPDATE_PERSON, 'Person', {
      entityId: updated.id,
      details: `${updated.fullName} (${updated.uniqueId})`,
    });

    return updated;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const existing = await this.prisma.person.findUnique({
      where: { id },
      include: {
        idCard: { select: { id: true } },
        attendances: { select: { id: true }, take: 1 },
      },
    });
    if (!existing) throw new NotFoundException(`Person ${id} not found`);

    this.assertWriteScope(user, {
      blockId: existing.blockId,
      wardId: existing.wardId,
      boothId: existing.boothId,
    });

    if (existing.attendances.length > 0) {
      throw new ConflictException(
        'Cannot delete person with attendance records',
      );
    }

    const photoKey = this.storage.extractKeyFromUrl(existing.photoUrl);
    const aadhaarKey = this.storage.extractKeyFromUrl(existing.aadhaarImageUrl);

    await this.prisma.$transaction(async (tx) => {
      if (existing.idCard) {
        await tx.iDCard.delete({ where: { id: existing.idCard.id } });
      }
      await tx.person.delete({ where: { id } });
    });

    if (photoKey) await this.storage.remove(photoKey);
    if (aadhaarKey) await this.storage.remove(aadhaarKey);

    void this.audit.logForUser(user, AuditAction.DELETE_PERSON, 'Person', {
      entityId: id,
      details: `${existing.fullName} (${existing.uniqueId})`,
    });

    return { id, deleted: true };
  }

  /**
   * Phase 3 — enroll a fingerprint template against a person.
   * Re-enrolling overwrites the prior template (operator decision; the
   * Mantra SDK only ever returns one template per capture). Scoped by
   * the same write rules as person edits.
   */
  async enrollFingerprint(
    id: string,
    fingerprintTemplate: string,
    user: AuthenticatedUser,
  ) {
    const existing = await this.prisma.person.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Person ${id} not found`);

    this.assertWriteScope(user, {
      blockId: existing.blockId,
      wardId: existing.wardId,
      boothId: existing.boothId,
    });

    if (!fingerprintTemplate || fingerprintTemplate.length < 32) {
      throw new BadRequestException('fingerprintTemplate is too short');
    }

    await this.prisma.person.update({
      where: { id },
      data: {
        fingerprintTemplate,
        fingerprintEnrolled: true,
      },
    });

    void this.audit.logForUser(user, AuditAction.ENROLL_FINGERPRINT, 'Person', {
      entityId: id,
      details: `${existing.fullName} (${existing.uniqueId})`,
    });

    return { id, enrolled: true };
  }

  /**
   * Public-shape "is this person enrolled?" check. Deliberately does
   * NOT return the template itself — that field never leaves the DB
   * except when explicitly hydrated for matching (which we don't do
   * over the wire in Phase 3).
   */
  async fingerprintStatus(id: string, user: AuthenticatedUser) {
    const person = await this.prisma.person.findUnique({
      where: { id },
      select: {
        id: true,
        blockId: true,
        wardId: true,
        boothId: true,
        fingerprintEnrolled: true,
      },
    });
    if (!person) throw new NotFoundException(`Person ${id} not found`);

    // Read-scope check (mirror of findOne).
    const scope = this.buildScopeWhere(user);
    const visible = await this.prisma.person.findFirst({
      where: { AND: [{ id }, scope] },
      select: { id: true },
    });
    if (!visible) throw new ForbiddenException('Access denied');

    return { id, enrolled: person.fingerprintEnrolled };
  }

  async stats(user: AuthenticatedUser) {
    const where = this.buildScopeWhere(user);

    const countWith = (extra: Prisma.PersonWhereInput) =>
      this.prisma.person.count({ where: { ...where, ...extra } });

    const [total, male, female, other] = await Promise.all([
      this.prisma.person.count({ where }),
      countWith({ gender: Gender.MALE }),
      countWith({ gender: Gender.FEMALE }),
      countWith({ gender: Gender.OTHER }),
    ]);

    const [rMember, rWorker, rWard, rBlock] = await Promise.all([
      countWith({ role: PartyRole.MEMBER }),
      countWith({ role: PartyRole.BOOTH_WORKER }),
      countWith({ role: PartyRole.WARD_ADMIN }),
      countWith({ role: PartyRole.BLOCK_ADMIN }),
    ]);

    const [sActive, sInactive, sPending] = await Promise.all([
      countWith({ status: Status.ACTIVE }),
      countWith({ status: Status.INACTIVE }),
      countWith({ status: Status.PENDING }),
    ]);

    return {
      total,
      byGender: [
        { gender: Gender.MALE, count: male },
        { gender: Gender.FEMALE, count: female },
        { gender: Gender.OTHER, count: other },
      ],
      byRole: [
        { role: PartyRole.MEMBER, count: rMember },
        { role: PartyRole.BOOTH_WORKER, count: rWorker },
        { role: PartyRole.WARD_ADMIN, count: rWard },
        { role: PartyRole.BLOCK_ADMIN, count: rBlock },
      ],
      byStatus: [
        { status: Status.ACTIVE, count: sActive },
        { status: Status.INACTIVE, count: sInactive },
        { status: Status.PENDING, count: sPending },
      ],
    };
  }
}
