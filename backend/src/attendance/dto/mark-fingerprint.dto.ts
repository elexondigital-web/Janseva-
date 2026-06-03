import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Phase 3 fingerprint marking: the frontend matches the captured template
 * against the person's stored template (or otherwise resolves the person)
 * and POSTs both pieces here. The backend trusts the resolution but still
 * scope-checks the person against the event.
 *
 * Real biometric matching belongs in a downstream SDK; this DTO is the
 * pragmatic prototype contract per the Phase 3 spec.
 */
export class MarkFingerprintDto {
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  /** Either uniqueId (preferred) or personId (cuid) is required. */
  @IsOptional()
  @IsString()
  uniqueId?: string;

  @IsOptional()
  @IsString()
  personId?: string;

  /**
   * Base64 ISO/IEC 19794-2 template captured from Mantra MFS100. Stored
   * for audit only on this code path — matching is done client-side.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  fingerprintTemplate!: string;
}
