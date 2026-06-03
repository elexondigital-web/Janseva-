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
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { AuthenticatedUser } from '../auth/types';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  private getUser(req: Request): AuthenticatedUser {
    return req.user as AuthenticatedUser;
  }

  @Get()
  async list(@Query() query: ListEventsDto, @Req() req: Request) {
    const data = await this.events.findAll(this.getUser(req), query);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const data = await this.events.findOne(id, this.getUser(req));
    return { success: true, data };
  }

  @Post()
  async create(@Body() dto: CreateEventDto, @Req() req: Request) {
    const data = await this.events.create(dto, this.getUser(req));
    return { success: true, data, message: 'Event created' };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: Request,
  ) {
    const data = await this.events.update(id, dto, this.getUser(req));
    return { success: true, data, message: 'Event updated' };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request) {
    const data = await this.events.remove(id, this.getUser(req));
    return { success: true, data, message: 'Event deleted' };
  }
}
