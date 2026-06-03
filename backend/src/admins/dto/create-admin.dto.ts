import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AdminRole } from '@prisma/client';

export class CreateAdminDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email!: string;

  /**
   * Optional — when omitted the service generates a 12-char temp password,
   * marks `mustChangePassword: true`, and emails it (when SMTP configured).
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt limit
  password?: string;

  @IsEnum(AdminRole)
  role!: AdminRole;

  @IsOptional()
  @IsString()
  blockId?: string;

  @IsOptional()
  @IsString()
  wardId?: string;

  @IsOptional()
  @IsString()
  boothId?: string;

  /** Whether to send a welcome email with the temp password. Default true. */
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
