import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateBlockDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  district?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;
}
