import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { WardsService } from './wards.service';
import { CreateWardDto } from './dto/create-ward.dto';
import { UpdateWardDto } from './dto/update-ward.dto';

@Controller('wards')
@UseGuards(JwtAuthGuard)
export class WardsController {
  constructor(private wardsService: WardsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('blockId') blockId?: string,
  ) {
    const data = await this.wardsService.findAll(user, blockId);
    return { success: true, data, message: 'Wards retrieved' };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.wardsService.findOne(id, user);
    return { success: true, data, message: 'Ward retrieved' };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateWardDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.wardsService.create(dto, user);
    return { success: true, data, message: 'Ward created' };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWardDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.wardsService.update(id, dto, user);
    return { success: true, data, message: 'Ward updated' };
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.wardsService.remove(id, user);
    return { success: true, data, message: 'Ward deleted' };
  }
}
