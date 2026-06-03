import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AttendanceService } from './attendance.service';
import { MarkQrDto } from './dto/mark-qr.dto';
import { MarkManualDto } from './dto/mark-manual.dto';
import { MarkFingerprintDto } from './dto/mark-fingerprint.dto';
import { AuthenticatedUser } from '../auth/types';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  private getUser(req: Request): AuthenticatedUser {
    return req.user as AuthenticatedUser;
  }

  @Post('qr')
  async markQr(@Body() dto: MarkQrDto, @Req() req: Request) {
    const data = await this.attendance.markQr(dto, this.getUser(req));
    return {
      success: true,
      data,
      message: data.alreadyMarked ? 'Already marked present' : 'Marked present',
    };
  }

  @Post('manual')
  async markManual(@Body() dto: MarkManualDto, @Req() req: Request) {
    const data = await this.attendance.markManual(dto, this.getUser(req));
    return { success: true, data, message: 'Marked present' };
  }

  @Post('fingerprint')
  async markFingerprint(
    @Body() dto: MarkFingerprintDto,
    @Req() req: Request,
  ) {
    const data = await this.attendance.markFingerprint(dto, this.getUser(req));
    return {
      success: true,
      data,
      message: data.alreadyMarked ? 'Already marked present' : 'Marked present',
    };
  }

  @Delete('event/:eventId/person/:personId')
  async unmark(
    @Param('eventId') eventId: string,
    @Param('personId') personId: string,
    @Req() req: Request,
  ) {
    const data = await this.attendance.unmark(
      eventId,
      personId,
      this.getUser(req),
    );
    return { success: true, data, message: 'Attendance removed' };
  }

  @Get('event/:eventId')
  async listForEvent(
    @Param('eventId') eventId: string,
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.attendance.listForEvent(
      eventId,
      this.getUser(req),
      {
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );
    return { success: true, data };
  }

  @Get('stats/:eventId')
  async stats(@Param('eventId') eventId: string, @Req() req: Request) {
    const data = await this.attendance.statsForEvent(
      eventId,
      this.getUser(req),
    );
    return { success: true, data };
  }

  @Get('person/:personId')
  async listForPerson(
    @Param('personId') personId: string,
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.attendance.listForPerson(
      personId,
      this.getUser(req),
      {
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );
    return { success: true, data };
  }
}
