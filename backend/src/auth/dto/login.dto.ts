import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { AdminRole } from '@prisma/client';
import { LowerTrim } from '../../common/transforms';

export class LoginDto {
  @LowerTrim()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  // bcrypt's hard limit; passwords longer than this are silently truncated
  // by `bcrypt.hash`, so reject upfront for clarity.
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsEnum(AdminRole, { message: 'Invalid role' })
  role?: AdminRole;
}
