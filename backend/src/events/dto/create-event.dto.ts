import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { EventType, TargetLevel } from '@prisma/client';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsEnum(EventType)
  type!: EventType;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  blockId!: string;

  @IsOptional()
  @IsString()
  wardId?: string;

  @IsOptional()
  @IsString()
  boothId?: string;

  @IsOptional()
  @IsEnum(TargetLevel)
  targetLevel?: TargetLevel;
}
