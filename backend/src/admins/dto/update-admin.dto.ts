import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AdminRole } from '@prisma/client';

/**
 * Phase 4 admin update — never accepts password changes here (use the
 * dedicated `/admins/:id/reset-password` route). Email is also locked
 * post-creation for audit clarity.
 */
export class UpdateAdminDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @IsOptional()
  @IsString()
  blockId?: string | null;

  @IsOptional()
  @IsString()
  wardId?: string | null;

  @IsOptional()
  @IsString()
  boothId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
