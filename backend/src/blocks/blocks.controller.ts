import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { BlocksService } from './blocks.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';

@Controller('blocks')
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private blocksService: BlocksService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.blocksService.findAll(user);
    return { success: true, data, message: 'Blocks retrieved' };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.blocksService.findOne(id, user);
    return { success: true, data, message: 'Block retrieved' };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateBlockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.blocksService.create(dto, user);
    return { success: true, data, message: 'Block created' };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBlockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.blocksService.update(id, dto, user);
    return { success: true, data, message: 'Block updated' };
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.blocksService.remove(id, user);
    return { success: true, data, message: 'Block deleted' };
  }
}
