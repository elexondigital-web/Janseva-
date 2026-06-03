import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from './storage.service';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded (field name: "file")');
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed: jpg, png, webp`,
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`File too large (max ${MAX_BYTES / 1024 / 1024}MB)`);
    }

    const folderKey: 'photos' | 'aadhaar' | 'misc' =
      folder === 'photos' || folder === 'aadhaar' ? folder : 'misc';

    const result = await this.storage.upload(file, folderKey);
    return {
      success: true,
      data: result,
      message: 'File uploaded',
    };
  }
}
