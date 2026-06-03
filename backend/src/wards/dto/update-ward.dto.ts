import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateWardDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  blockId?: string;
}
