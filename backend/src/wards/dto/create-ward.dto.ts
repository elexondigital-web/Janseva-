import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateWardDto {
  @IsString()
  @IsNotEmpty({ message: 'Ward name is required' })
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'blockId is required' })
  blockId: string;
}
