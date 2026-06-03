import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PeopleService } from './people.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { ListPeopleDto } from './dto/list-people.dto';
import { SearchPeopleDto } from './dto/search-people.dto';
import { EnrollFingerprintDto } from './dto/enroll-fingerprint.dto';
import { AuthenticatedUser } from '../auth/types';

@Controller('people')
@UseGuards(JwtAuthGuard)
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  private getUser(req: Request): AuthenticatedUser {
    return req.user as AuthenticatedUser;
  }

  @Get('stats')
  async stats(@Req() req: Request) {
    const data = await this.people.stats(this.getUser(req));
    return { success: true, data };
  }

  @Get('search')
  async search(@Req() req: Request, @Query() dto: SearchPeopleDto) {
    const data = await this.people.search(this.getUser(req), dto);
    return { success: true, data };
  }

  @Get()
  async findAll(@Req() req: Request, @Query() query: ListPeopleDto) {
    const data = await this.people.findAll(this.getUser(req), query);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const data = await this.people.findOne(id, this.getUser(req));
    return { success: true, data };
  }

  @Post()
  async create(@Body() dto: CreatePersonDto, @Req() req: Request) {
    const data = await this.people.create(dto, this.getUser(req));
    return { success: true, data, message: 'Person created' };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePersonDto,
    @Req() req: Request,
  ) {
    const data = await this.people.update(id, dto, this.getUser(req));
    return { success: true, data, message: 'Person updated' };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request) {
    const data = await this.people.remove(id, this.getUser(req));
    return { success: true, data, message: 'Person deleted' };
  }

  @Post(':id/enroll-fingerprint')
  async enrollFingerprint(
    @Param('id') id: string,
    @Body() dto: EnrollFingerprintDto,
    @Req() req: Request,
  ) {
    const data = await this.people.enrollFingerprint(
      id,
      dto.fingerprintTemplate,
      this.getUser(req),
    );
    return { success: true, data, message: 'Fingerprint enrolled' };
  }

  @Get(':id/fingerprint-status')
  async fingerprintStatus(@Param('id') id: string, @Req() req: Request) {
    const data = await this.people.fingerprintStatus(id, this.getUser(req));
    return { success: true, data };
  }
}
