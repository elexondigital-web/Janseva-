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
import { BoothsService } from './booths.service';
import { CreateBoothDto } from './dto/create-booth.dto';
import { UpdateBoothDto } from './dto/update-booth.dto';

@Controller('booths')
@UseGuards(JwtAuthGuard)
export class BoothsController {
  constructor(private boothsService: BoothsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('wardId') wardId?: string,
    @Query('blockId') blockId?: string,
  ) {
    const data = await this.boothsService.findAll(user, wardId, blockId);
    return { success: true, data, message: 'Booths retrieved' };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.boothsService.findOne(id, user);
    return { success: true, data, message: 'Booth retrieved' };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateBoothDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.boothsService.create(dto, user);
    return { success: true, data, message: 'Booth created' };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBoothDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.boothsService.update(id, dto, user);
    return { success: true, data, message: 'Booth updated' };
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.boothsService.remove(id, user);
    return { success: true, data, message: 'Booth deleted' };
  }
}
