import { IsNotEmpty, IsString } from 'class-validator';

export class MarkQrDto {
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  /**
   * Raw payload scanned from the card's QR. We accept either:
   *   - a JSON string like `{"id":"...","uniqueId":"JS-000001","name":"..."}`
   *   - a bare `uniqueCardId` like `CARD-JS-000001`
   *   - a bare `uniqueId` like `JS-000001`
   * Resolver logic lives in the service.
   */
  @IsString()
  @IsNotEmpty()
  qrData!: string;
}
