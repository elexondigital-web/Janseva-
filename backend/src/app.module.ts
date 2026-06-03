import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { BlocksModule } from './blocks/blocks.module';
import { WardsModule } from './wards/wards.module';
import { BoothsModule } from './booths/booths.module';
import { UploadsModule } from './uploads/uploads.module';
import { PeopleModule } from './people/people.module';
import { IdCardsModule } from './idcards/idcards.module';
import { EventsModule } from './events/events.module';
import { AttendanceModule } from './attendance/attendance.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MessagingModule } from './messaging/messaging.module';
import { ReportsModule } from './reports/reports.module';
import { AdminsModule } from './admins/admins.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    /**
     * Phase 4 rate limiting. Two named buckets:
     *   - default: 100 requests per minute per IP across the whole API
     *   - auth:    5 requests per minute per IP — applied with @Throttle()
     *              on the login endpoint to slow brute-force attempts.
     * Both share the same in-memory store; replace with the Redis
     * storage adapter when scaling horizontally.
     */
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      { name: 'auth', ttl: 60_000, limit: 5 },
    ]),
    PrismaModule,
    AuthModule,
    BlocksModule,
    WardsModule,
    BoothsModule,
    UploadsModule,
    PeopleModule,
    IdCardsModule,
    EventsModule,
    AttendanceModule,
    DashboardModule,
    MessagingModule,
    ReportsModule,
    AdminsModule,
    AuditModule,
    HealthModule,
  ],
  providers: [
    // Apply ThrottlerGuard globally — every controller is rate-limited.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
