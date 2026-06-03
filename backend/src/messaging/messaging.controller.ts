import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagingService } from './messaging.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';
import { AuthenticatedUser } from '../auth/types';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  private getUser(req: Request): AuthenticatedUser {
    return req.user as AuthenticatedUser;
  }

  @Post('send')
  async send(@Body() dto: SendMessageDto, @Req() req: Request) {
    const data = await this.messaging.sendMessage(dto, this.getUser(req));
    return { success: true, data, message: data.message };
  }

  @Get()
  async list(@Req() req: Request, @Query() dto: ListMessagesDto) {
    const data = await this.messaging.list(this.getUser(req), dto);
    return { success: true, data };
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: Request) {
    const data = await this.messaging.get(id, this.getUser(req));
    return { success: true, data };
  }
}
