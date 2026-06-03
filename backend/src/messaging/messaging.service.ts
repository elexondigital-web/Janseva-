import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  AdminRole,
  MessageType,
  Prisma,
  Status,
  TargetLevel,
} from '@prisma/client';
import axios from 'axios';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types';
import { AuditAction, AuditService } from '../audit/audit.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';

/** Recipient row used for variable substitution + provider dispatch. */
interface Recipient {
  fullName: string;
  uniqueId: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  wardName: string | null;
  boothName: string | null;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger('MessagingService');

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ----- helpers ----------------------------------------------------------

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Replace {name} {ward} {booth} {id} {phone} with per-recipient values. */
  private replaceVars(template: string, r: Recipient): string {
    return template
      .replace(/\{name\}/g, r.fullName)
      .replace(/\{ward\}/g, r.wardName ?? '')
      .replace(/\{booth\}/g, r.boothName ?? '')
      .replace(/\{id\}/g, r.uniqueId)
      .replace(/\{phone\}/g, r.phone);
  }

  /** Normalize an Indian mobile to E.164-ish "91xxxxxxxxxx". */
  private normalizePhone(p: string | null | undefined): string | null {
    if (!p) return null;
    const digits = p.replace(/\D/g, '');
    if (digits.length < 10) return null;
    return '91' + digits.slice(-10);
  }

  /** Resolve recipients for a (targetLevel, targetId, blockId). */
  async resolveRecipients(
    targetLevel: TargetLevel,
    targetId: string | undefined,
    blockId: string,
  ): Promise<Recipient[]> {
    if (targetLevel === TargetLevel.WARD && !targetId)
      throw new BadRequestException('targetId (wardId) is required for WARD');
    if (targetLevel === TargetLevel.BOOTH && !targetId)
      throw new BadRequestException(
        'targetId (boothId) is required for BOOTH',
      );

    const where: Prisma.PersonWhereInput = {
      blockId,
      status: Status.ACTIVE,
    };

    switch (targetLevel) {
      case TargetLevel.ALL:
      case TargetLevel.BLOCK:
        // both ALL and BLOCK collapse to "every active person in this block"
        // (the dashboard distinction is "all members" vs "all admins" — admin
        // dispatch is handled separately below).
        break;
      case TargetLevel.WARD:
        where.wardId = targetId!;
        break;
      case TargetLevel.BOOTH:
        where.boothId = targetId!;
        break;
    }

    const people = await this.prisma.person.findMany({
      where,
      select: {
        fullName: true,
        uniqueId: true,
        phone: true,
        whatsapp: true,
        email: true,
        ward: { select: { name: true } },
        booth: { select: { name: true } },
      },
    });

    return people.map((p) => ({
      fullName: p.fullName,
      uniqueId: p.uniqueId,
      phone: p.phone,
      whatsapp: p.whatsapp,
      email: p.email,
      wardName: p.ward?.name ?? null,
      boothName: p.booth?.name ?? null,
    }));
  }

  // ----- providers --------------------------------------------------------

  /**
   * Provider result shape. When `demo` is true the broadcast was
   * counted as successful even though no real send happened — used in
   * environments where the third-party API keys aren't configured.
   * The Message row's `status` should be set to `sent` in that case
   * so the operator sees green ticks rather than red failures.
   */
  private demoResult(recipients: Recipient[]): {
    sent: number;
    failed: number;
    demo: boolean;
  } {
    return { sent: recipients.length, failed: 0, demo: true };
  }

  /** MSG91 transactional SMS — chunks of 50, 500ms gap. */
  private async sendSMS(
    recipients: Recipient[],
    template: string,
  ): Promise<{ sent: number; failed: number; demo?: boolean }> {
    const authKey = process.env.MSG91_AUTH_KEY;
    const flowId = process.env.MSG91_FLOW_ID;
    const senderId = process.env.MSG91_SENDER_ID ?? 'JNSEVA';

    if (!authKey || !flowId) {
      this.logger.log(
        `[demo] MSG91 not configured — simulating SMS send to ${recipients.length} recipient(s)`,
      );
      return this.demoResult(recipients);
    }

    let sent = 0;
    let failed = 0;

    // Group by rendered message: MSG91 flow templates take a single VAR1 per
    // request, so recipients sharing the same rendered text can be batched.
    const byMsg = new Map<string, Recipient[]>();
    for (const r of recipients) {
      const phone = this.normalizePhone(r.phone);
      if (!phone) {
        failed++;
        continue;
      }
      const msg = this.replaceVars(template, r);
      const arr = byMsg.get(msg) ?? [];
      arr.push(r);
      byMsg.set(msg, arr);
    }

    for (const [msg, group] of byMsg) {
      const phones = group
        .map((r) => this.normalizePhone(r.phone))
        .filter((p): p is string => Boolean(p));

      const batches = this.chunk(phones, 50);
      for (const batch of batches) {
        try {
          await axios.post(
            'https://api.msg91.com/api/v5/flow/',
            {
              flow_id: flowId,
              sender: senderId,
              mobiles: batch.join(','),
              VAR1: msg,
            },
            {
              headers: {
                authkey: authKey,
                'Content-Type': 'application/json',
              },
              timeout: 10000,
            },
          );
          sent += batch.length;
        } catch (err: any) {
          this.logger.error(
            `MSG91 batch failed: ${err?.response?.status} ${err?.message}`,
          );
          failed += batch.length;
        }
        await this.sleep(500);
      }
    }

    return { sent, failed };
  }

  /** WhatsApp Cloud API — one POST per recipient with a 1s gap. */
  private async sendWhatsApp(
    recipients: Recipient[],
    template: string,
  ): Promise<{ sent: number; failed: number; demo?: boolean }> {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) {
      this.logger.log(
        `[demo] WhatsApp not configured — simulating send to ${recipients.length} recipient(s)`,
      );
      return this.demoResult(recipients);
    }

    let sent = 0;
    let failed = 0;
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

    // Chunk only for log readability; we still pace one-per-second.
    const batches = this.chunk(recipients, 20);
    for (const batch of batches) {
      for (const r of batch) {
        const to = this.normalizePhone(r.whatsapp ?? r.phone);
        if (!to) {
          failed++;
          continue;
        }
        try {
          await axios.post(
            url,
            {
              messaging_product: 'whatsapp',
              to,
              type: 'text',
              text: {
                body: this.replaceVars(template, r),
                preview_url: false,
              },
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              timeout: 10000,
            },
          );
          sent++;
        } catch (err: any) {
          this.logger.error(
            `WhatsApp send failed for ${to}: ${err?.response?.data?.error?.message ?? err?.message}`,
          );
          failed++;
        }
        await this.sleep(1000);
      }
    }

    return { sent, failed };
  }

  /** SMTP email via Nodemailer — BCC chunks of 50, 2s gap. */
  private async sendEmail(
    recipients: Recipient[],
    subject: string,
    template: string,
  ): Promise<{ sent: number; failed: number; demo?: boolean }> {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const userId = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const fromName = process.env.SMTP_FROM_NAME ?? 'JanSeva';

    if (!host || !port || !userId || !pass) {
      this.logger.log(
        `[demo] SMTP not configured — simulating email send to ${recipients.length} recipient(s)`,
      );
      return this.demoResult(recipients);
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: false,
      auth: { user: userId, pass },
    });

    let sent = 0;
    let failed = 0;

    // BCC batches share one body — so we send once per (rendered body) group.
    const byBody = new Map<string, Recipient[]>();
    for (const r of recipients) {
      if (!r.email) {
        failed++;
        continue;
      }
      const body = this.replaceVars(template, r);
      const arr = byBody.get(body) ?? [];
      arr.push(r);
      byBody.set(body, arr);
    }

    for (const [body, group] of byBody) {
      const emails = group.map((r) => r.email!).filter(Boolean);
      const batches = this.chunk(emails, 50);
      for (const batch of batches) {
        try {
          await transporter.sendMail({
            from: `"${fromName}" <${userId}>`,
            bcc: batch.join(','),
            subject,
            html: body,
          });
          sent += batch.length;
        } catch (err: any) {
          this.logger.error(`SMTP batch failed: ${err?.message}`);
          failed += batch.length;
        }
        await this.sleep(2000);
      }
    }

    return { sent, failed };
  }

  // ----- API surface ------------------------------------------------------

  /**
   * Resolve the block this action is scoped to.
   *
   * For non-super-admins this is hard-pinned to their own blockId.
   *
   * For SUPER_ADMIN the rule depends on what they're doing:
   *   - **send** must specify a block (the recipient pool is bounded
   *     to a single block). If none was supplied, fall back to the
   *     only block in the system — keeps single-block demo deployments
   *     working without the operator hand-picking it. Multi-block
   *     installs throw and force a choice.
   *   - **list / get** can pass `requireBlock = false` to opt out of
   *     the requirement entirely; the caller filters by `dto.blockId`
   *     when explicit and shows everything otherwise.
   */
  private async effectiveBlockId(
    user: AuthenticatedUser,
    requested: string | undefined,
    opts: { requireBlock?: boolean } = {},
  ): Promise<string> {
    const requireBlock = opts.requireBlock ?? true;
    if (user.role === AdminRole.SUPER_ADMIN) {
      if (requested) return requested;
      if (!requireBlock) return ''; // caller treats empty as "no scope"
      // Pragmatic fallback for single-block deployments.
      const blocks = await this.prisma.block.findMany({
        select: { id: true },
        take: 2,
      });
      if (blocks.length === 1) return blocks[0].id;
      throw new BadRequestException(
        'SUPER_ADMIN must specify blockId for messaging when more than one block exists',
      );
    }
    if (!user.blockId)
      throw new ForbiddenException('Account has no block assigned');
    if (requested && requested !== user.blockId)
      throw new ForbiddenException('Cannot message outside your block');
    return user.blockId;
  }

  async sendMessage(dto: SendMessageDto, user: AuthenticatedUser) {
    const blockId = await this.effectiveBlockId(user, dto.blockId, {
      requireBlock: true,
    });

    // Ward/Booth scope check for non-super-admins.
    if (
      dto.targetLevel === TargetLevel.WARD &&
      user.role === AdminRole.WARD_ADMIN &&
      dto.targetId !== user.wardId
    ) {
      throw new ForbiddenException('Cannot message outside your ward');
    }
    if (
      dto.targetLevel === TargetLevel.BOOTH &&
      user.role === AdminRole.BOOTH_WORKER &&
      dto.targetId !== user.boothId
    ) {
      throw new ForbiddenException('Cannot message outside your booth');
    }

    const recipients = await this.resolveRecipients(
      dto.targetLevel,
      dto.targetId,
      blockId,
    );

    if (recipients.length === 0) {
      throw new BadRequestException('No recipients matched this target');
    }

    // Persist a Message row up-front so the frontend can show "Sending…".
    // failedCount is updated when the background dispatch resolves.
    const record = await this.prisma.message.create({
      data: {
        type: dto.type,
        content: dto.content,
        subject: dto.subject ?? null,
        sentBy: user.id,
        targetLevel: dto.targetLevel,
        targetId: dto.targetId ?? null,
        recipientCount: recipients.length,
        status: 'sending',
        blockId,
      },
    });

    // Fire-and-forget dispatch. We do NOT await; the controller responds
    // immediately. Any failure ends up in the message row's failedCount.
    void this.dispatchInBackground(record.id, dto, recipients);

    void this.audit.logForUser(user, AuditAction.SEND_MESSAGE, 'Message', {
      entityId: record.id,
      details: `${dto.type} → ${recipients.length} recipient${
        recipients.length === 1 ? '' : 's'
      } (target=${dto.targetLevel}${dto.targetId ? `:${dto.targetId}` : ''})`,
    });

    return {
      messageId: record.id,
      recipientCount: recipients.length,
      message: `Sending to ${recipients.length} recipient${
        recipients.length === 1 ? '' : 's'
      }`,
    };
  }

  private async dispatchInBackground(
    messageId: string,
    dto: SendMessageDto,
    recipients: Recipient[],
  ) {
    try {
      let result: { sent: number; failed: number; demo?: boolean };
      switch (dto.type) {
        case MessageType.SMS:
          result = await this.sendSMS(recipients, dto.content);
          break;
        case MessageType.WHATSAPP:
          result = await this.sendWhatsApp(recipients, dto.content);
          break;
        case MessageType.EMAIL:
          result = await this.sendEmail(
            recipients,
            dto.subject ?? '(no subject)',
            dto.content,
          );
          break;
      }

      // Demo-mode sends use the dedicated 'demo' status so the UI can
      // surface a clear yellow/amber pill instead of the green 'sent'
      // pill — operators must understand no real send happened.
      const status = result.demo
        ? 'demo'
        : result.failed === 0
          ? 'sent'
          : 'partial';
      await this.prisma.message.update({
        where: { id: messageId },
        data: { status, failedCount: result.failed },
      });
    } catch (err: any) {
      this.logger.error(`Dispatch failed for ${messageId}: ${err?.message}`);
      await this.prisma.message
        .update({
          where: { id: messageId },
          data: { status: 'failed', failedCount: recipients.length },
        })
        .catch(() => {});
    }
  }

  async list(user: AuthenticatedUser, dto: ListMessagesDto) {
    const blockId = await this.effectiveBlockId(user, dto.blockId, {
      requireBlock: false,
    });
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    // Empty blockId here means "SUPER_ADMIN with no scope filter" —
    // show everything, otherwise pin to that block.
    const where: Prisma.MessageWhereInput = blockId ? { blockId } : {};
    if (dto.type) where.type = dto.type;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sentAt: 'desc' },
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async get(id: string, user: AuthenticatedUser) {
    const msg = await this.prisma.message.findUnique({ where: { id } });
    if (!msg) throw new NotFoundException(`Message ${id} not found`);

    if (
      user.role !== AdminRole.SUPER_ADMIN &&
      msg.blockId !== user.blockId
    ) {
      throw new ForbiddenException('Out of block scope');
    }
    return msg;
  }
}
