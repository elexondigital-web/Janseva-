import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminsService } from './admins.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { ListAdminsDto } from './dto/list-admins.dto';
import { AuthenticatedUser } from '../auth/types';

@Controller('admins')
@UseGuards(JwtAuthGuard)
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  private getUser(req: Request): AuthenticatedUser {
    return req.user as AuthenticatedUser;
  }

  @Get('stats')
  async stats(@Req() req: Request) {
    const data = await this.admins.stats(this.getUser(req));
    return { success: true, data };
  }

  @Get()
  async list(@Req() req: Request, @Query() dto: ListAdminsDto) {
    const data = await this.admins.list(this.getUser(req), dto);
    return { success: true, data };
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: Request) {
    const data = await this.admins.get(id, this.getUser(req));
    return { success: true, data };
  }

  @Post()
  async create(@Body() dto: CreateAdminDto, @Req() req: Request) {
    const data = await this.admins.create(dto, this.getUser(req));
    return { success: true, data, message: 'Admin created' };
  }

  /**
   * Both PUT and PATCH are accepted to play well with REST clients —
   * functional behaviour is identical (partial update via UpdateAdminDto).
   */
  @Put(':id')
  async updatePut(
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
    @Req() req: Request,
  ) {
    const data = await this.admins.update(id, dto, this.getUser(req));
    return { success: true, data, message: 'Admin updated' };
  }

  @Patch(':id')
  async updatePatch(
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
    @Req() req: Request,
  ) {
    const data = await this.admins.update(id, dto, this.getUser(req));
    return { success: true, data, message: 'Admin updated' };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request) {
    const data = await this.admins.remove(id, this.getUser(req));
    return { success: true, data, message: 'Admin deactivated' };
  }

  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string, @Req() req: Request) {
    const data = await this.admins.resetPassword(id, this.getUser(req));
    return { success: true, data, message: 'Password reset' };
  }
}
