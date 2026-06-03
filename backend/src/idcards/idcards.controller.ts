import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IdCardsService } from './idcards.service';
import { BulkCardsDto } from './dto/bulk-cards.dto';
import { AuthenticatedUser } from '../auth/types';

@Controller('idcards')
@UseGuards(JwtAuthGuard)
export class IdCardsController {
  constructor(private readonly cards: IdCardsService) {}

  private getUser(req: Request): AuthenticatedUser {
    return req.user as AuthenticatedUser;
  }

  @Post('bulk')
  async bulk(@Body() dto: BulkCardsDto, @Req() req: Request) {
    const data = await this.cards.bulkGenerate(this.getUser(req), dto);
    return { success: true, data };
  }

  @Post('person/:personId')
  async issue(@Param('personId') personId: string, @Req() req: Request) {
    const data = await this.cards.issue(personId, this.getUser(req));
    return { success: true, data, message: 'ID card issued' };
  }

  @Get('person/:personId')
  async findByPerson(
    @Param('personId') personId: string,
    @Req() req: Request,
  ) {
    const data = await this.cards.findByPerson(personId, this.getUser(req));
    return { success: true, data };
  }

  // Alias: /idcards/:personId/full — same full payload as /person/:personId,
  // easier to link from UI deep-links like /id-cards?personId=xxx.
  @Get(':personId/full')
  async findFull(@Param('personId') personId: string, @Req() req: Request) {
    const data = await this.cards.findByPerson(personId, this.getUser(req));
    return { success: true, data };
  }

  @Delete('person/:personId')
  async revoke(@Param('personId') personId: string, @Req() req: Request) {
    const data = await this.cards.revoke(personId, this.getUser(req));
    return { success: true, data, message: 'ID card revoked' };
  }
}
