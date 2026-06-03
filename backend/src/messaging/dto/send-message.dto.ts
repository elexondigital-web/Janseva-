import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { MessageType, TargetLevel } from '@prisma/client';

export class SendMessageDto {
  @IsEnum(MessageType)
  type!: MessageType;

  /**
   * Body of the message. For SMS this is the raw text; for WhatsApp,
   * raw text inside a 24h session; for Email, treated as HTML body.
   * Template tokens like {name}, {ward}, {booth}, {id}, {phone} are
   * substituted per recipient before send.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  content!: string;

  /** Email subject — required when type=EMAIL, ignored otherwise. */
  @ValidateIf((o) => o.type === MessageType.EMAIL)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  subject?: string;

  @IsEnum(TargetLevel)
  targetLevel!: TargetLevel;

  /**
   * For WARD targets, the wardId; for BOOTH targets, the boothId.
   * Ignored for ALL/BLOCK.
   */
  @IsOptional()
  @IsString()
  targetId?: string;

  /**
   * The block this send is anchored to. SUPER_ADMIN may pass any
   * block; lower-role admins are forced to their own block by the
   * service layer.
   */
  @IsOptional()
  @IsString()
  blockId?: string;
}
