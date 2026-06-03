import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateBoothDto {
  @IsString()
  @IsNotEmpty({ message: 'Booth name is required' })
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'wardId is required' })
  wardId: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  location?: string;
}
