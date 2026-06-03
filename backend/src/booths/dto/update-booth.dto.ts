import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateBoothDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  wardId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  location?: string;
}
