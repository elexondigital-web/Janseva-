import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateBlockDto {
  @IsString()
  @IsNotEmpty({ message: 'Block name is required' })
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'District is required' })
  @MaxLength(100)
  district: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;
}
