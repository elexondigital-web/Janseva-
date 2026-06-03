import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Public health endpoint — no auth, used by uptime monitors.
   *
   * Returns 200 with `{ ok: true, db: 'up' | 'down' }` when the
   * Postgres connection is reachable, 200 with `db: 'down'` otherwise.
   * Always 200 status so monitors only flag total-process-down vs. a
   * partial DB outage; the JSON body distinguishes the two.
   *
   * Throttled to 30/min/IP — well above what any sane monitor needs
   * but enough to deter scanners.
   */
  @Get('health')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async health() {
    let db: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }

    // Surface which optional integrations are configured so the
    // frontend can show "demo mode" banners without hard-coding a
    // toggle. Returns booleans only — no secret values leak.
    const providers = {
      sms: Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_FLOW_ID),
      whatsapp: Boolean(
        process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
      ),
      email: Boolean(
        process.env.SMTP_HOST &&
          process.env.SMTP_PORT &&
          process.env.SMTP_USER &&
          process.env.SMTP_PASS,
      ),
      s3: Boolean(
        process.env.AWS_ACCESS_KEY_ID &&
          process.env.AWS_SECRET_ACCESS_KEY &&
          process.env.AWS_BUCKET_NAME,
      ),
    };
    const demoMode =
      !providers.sms &&
      !providers.whatsapp &&
      !providers.email;

    return {
      ok: true,
      db,
      uptime: Math.round(process.uptime()),
      providers,
      demoMode,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async stats(@Req() req: Request) {
    const data = await this.dashboard.getStats(req.user as AuthenticatedUser);
    return { success: true, data };
  }
}
