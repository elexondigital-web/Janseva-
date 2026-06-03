import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AttendanceMethod } from '@prisma/client';

export class MarkManualDto {
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  personId!: string;

  /** Defaults to MANUAL if omitted. */
  @IsOptional()
  @IsEnum(AttendanceMethod)
  method?: AttendanceMethod;
}
