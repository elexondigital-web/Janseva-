import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { AdminRole, Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types';
import { BulkCardsDto } from './dto/bulk-cards.dto';

const BULK_CARD_LIMIT = 1500;

@Injectable()
export class IdCardsService {
  constructor(private prisma: PrismaService) {}

  private assertScope(user: AuthenticatedUser, person: {
    blockId: string;
    wardId: string;
    boothId: string;
  }): void {
    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
        return;
      case AdminRole.BLOCK_ADMIN:
        if (person.blockId !== user.blockId)
          throw new ForbiddenException('Out of block scope');
        return;
      case AdminRole.WARD_ADMIN:
        if (person.wardId !== user.wardId)
          throw new ForbiddenException('Out of ward scope');
        return;
      case AdminRole.BOOTH_WORKER:
        if (person.boothId !== user.boothId)
          throw new ForbiddenException('Out of booth scope');
        return;
    }
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

  async issue(personId: string, user: AuthenticatedUser) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: { idCard: true },
    });
    if (!person) throw new NotFoundException(`Person ${personId} not found`);

    this.assertScope(user, {
      blockId: person.blockId,
      wardId: person.wardId,
      boothId: person.boothId,
    });

    if (person.idCard) {
      throw new ConflictException('ID card already issued for this person');
    }

    const uniqueCardId = `CARD-${person.uniqueId}`;
    const qrPayload = JSON.stringify({
      id: person.id,
      uniqueId: person.uniqueId,
      name: person.fullName,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 300,
    });

    const card = await this.prisma.iDCard.create({
      data: {
        personId: person.id,
        uniqueCardId,
        qrCodeData: qrPayload,
      },
    });

    return {
      ...card,
      qrCodeDataUrl,
      person: {
        id: person.id,
        uniqueId: person.uniqueId,
        fullName: person.fullName,
        photoUrl: person.photoUrl,
        phone: person.phone,
        blockId: person.blockId,
        wardId: person.wardId,
        boothId: person.boothId,
      },
    };
  }

  async findByPerson(personId: string, user: AuthenticatedUser) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: {
        idCard: true,
        block: { select: { id: true, name: true, district: true } },
        ward: { select: { id: true, name: true } },
        booth: { select: { id: true, name: true } },
      },
    });
    if (!person) throw new NotFoundException(`Person ${personId} not found`);

    this.assertScope(user, {
      blockId: person.blockId,
      wardId: person.wardId,
      boothId: person.boothId,
    });

    if (!person.idCard) throw new NotFoundException('No ID card issued yet');

    const qrCodeDataUrl = await QRCode.toDataURL(person.idCard.qrCodeData, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 300,
    });

    return {
      ...person.idCard,
      qrCodeDataUrl,
      person: {
        id: person.id,
        uniqueId: person.uniqueId,
        fullName: person.fullName,
        fatherName: person.fatherName,
        photoUrl: person.photoUrl,
        phone: person.phone,
        address: person.address,
        block: person.block,
        ward: person.ward,
        booth: person.booth,
      },
    };
  }

  /**
   * Bulk-fetch cards for a filter set (block/ward/booth scope). When
   * `autoIssue` is true, creates cards for people who don't have one (within
   * the same transaction). Returns the same full shape as `findByPerson()` —
   * the frontend can render them into a PDF sheet with no extra round trips.
   *
   * Hard cap of 1500 cards per call to avoid DoS via oversized bulk jobs.
   */
  async bulkGenerate(user: AuthenticatedUser, dto: BulkCardsDto) {
    // Scope-gate first. BLOCK_ADMIN cannot target a different block;
    // WARD_ADMIN cannot target a different ward; etc.
    if (user.role === AdminRole.BLOCK_ADMIN && dto.blockId !== user.blockId) {
      throw new ForbiddenException('Out of block scope');
    }
    if (user.role === AdminRole.WARD_ADMIN) {
      if (dto.blockId !== user.blockId) {
        throw new ForbiddenException('Out of block scope');
      }
      if (dto.wardId && dto.wardId !== user.wardId) {
        throw new ForbiddenException('Out of ward scope');
      }
    }
    if (user.role === AdminRole.BOOTH_WORKER) {
      if (dto.blockId !== user.blockId)
        throw new ForbiddenException('Out of block scope');
      if (dto.wardId && dto.wardId !== user.wardId)
        throw new ForbiddenException('Out of ward scope');
      if (dto.boothId && dto.boothId !== user.boothId)
        throw new ForbiddenException('Out of booth scope');
    }

    const scopeWhere = this.buildScopeWhere(user);
    const where: Prisma.PersonWhereInput = {
      ...scopeWhere,
      blockId: dto.blockId,
      ...(dto.wardId ? { wardId: dto.wardId } : {}),
      ...(dto.boothId ? { boothId: dto.boothId } : {}),
    };

    const totalMatched = await this.prisma.person.count({ where });
    if (totalMatched > BULK_CARD_LIMIT) {
      throw new BadRequestException(
        `Too many people matched (${totalMatched}). Max ${BULK_CARD_LIMIT} per bulk job — please narrow the scope (pick a ward or booth).`,
      );
    }

    const people = await this.prisma.person.findMany({
      where,
      include: {
        idCard: true,
        block: { select: { id: true, name: true, district: true } },
        ward: { select: { id: true, name: true } },
        booth: { select: { id: true, name: true } },
      },
      orderBy: [{ ward: { name: 'asc' } }, { booth: { name: 'asc' } }, { fullName: 'asc' }],
    });

    let issuedCount = 0;
    let skippedCount = 0;

    if (dto.autoIssue) {
      // Issue missing cards sequentially so we can catch per-row failures.
      const toIssue = people.filter((p) => !p.idCard);
      for (const p of toIssue) {
        const uniqueCardId = `CARD-${p.uniqueId}`;
        const qrPayload = JSON.stringify({
          id: p.id,
          uniqueId: p.uniqueId,
          name: p.fullName,
        });
        const newCard = await this.prisma.iDCard.create({
          data: {
            personId: p.id,
            uniqueCardId,
            qrCodeData: qrPayload,
          },
        });
        // Splice the new card back into the in-memory record so the final
        // payload matches the on-disk state without a second query.
        p.idCard = newCard;
        issuedCount++;
      }
    }

    // Build the response. Skip revoked cards (isActive=false). Skip people
    // with no card when autoIssue=false.
    const cards = [] as Array<{
      id: string;
      personId: string;
      uniqueCardId: string;
      qrCodeData: string;
      qrCodeDataUrl: string;
      issuedAt: Date;
      isActive: boolean;
      person: {
        id: string;
        uniqueId: string;
        fullName: string;
        fatherName: string | null;
        photoUrl: string | null;
        phone: string;
        address: string | null;
        block: { id: string; name: string; district: string } | null;
        ward: { id: string; name: string } | null;
        booth: { id: string; name: string } | null;
      };
    }>;

    for (const p of people) {
      if (!p.idCard) {
        skippedCount++;
        continue;
      }
      if (!p.idCard.isActive) {
        skippedCount++;
        continue;
      }
      const qrCodeDataUrl = await QRCode.toDataURL(p.idCard.qrCodeData, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 300,
      });
      cards.push({
        id: p.idCard.id,
        personId: p.id,
        uniqueCardId: p.idCard.uniqueCardId,
        qrCodeData: p.idCard.qrCodeData,
        qrCodeDataUrl,
        issuedAt: p.idCard.issuedAt,
        isActive: p.idCard.isActive,
        person: {
          id: p.id,
          uniqueId: p.uniqueId,
          fullName: p.fullName,
          fatherName: p.fatherName,
          photoUrl: p.photoUrl,
          phone: p.phone,
          address: p.address,
          block: p.block,
          ward: p.ward,
          booth: p.booth,
        },
      });
    }

    return {
      cards,
      totalMatched,
      issuedCount,
      skippedCount,
    };
  }

  async revoke(personId: string, user: AuthenticatedUser) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: { idCard: true },
    });
    if (!person) throw new NotFoundException(`Person ${personId} not found`);

    this.assertScope(user, {
      blockId: person.blockId,
      wardId: person.wardId,
      boothId: person.boothId,
    });

    if (!person.idCard) throw new NotFoundException('No ID card to revoke');

    const updated = await this.prisma.iDCard.update({
      where: { id: person.idCard.id },
      data: { isActive: false },
    });
    return updated;
  }
}
