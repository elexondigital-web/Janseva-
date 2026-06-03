import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsEmail,
  IsDateString,
  MaxLength,
  Matches,
} from 'class-validator';
import { Gender, Category, PartyRole, Status } from '@prisma/client';
import { LowerTrim, Trim } from '../../common/transforms';

export class CreatePersonDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fatherName?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]{10}$/, { message: 'phone must be a 10-digit number' })
  phone!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{10}$/, { message: 'whatsapp must be a 10-digit number' })
  whatsapp?: string;

  @LowerTrim()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{12}$/, { message: 'aadhaarNumber must be a 12-digit number' })
  aadhaarNumber?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  voterId?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'pincode must be a 6-digit number' })
  pincode?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  occupation?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  caste?: string;

  @IsOptional()
  @IsEnum(Category)
  category?: Category;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  aadhaarImageUrl?: string;

  @IsOptional()
  @IsEnum(PartyRole)
  role?: PartyRole;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsString()
  @IsNotEmpty()
  boothId!: string;

  @IsString()
  @IsNotEmpty()
  wardId!: string;

  @IsString()
  @IsNotEmpty()
  blockId!: string;
}
