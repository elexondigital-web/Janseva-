import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class EnrollFingerprintDto {
  /**
   * Base64 ISO/IEC 19794-2 fingerprint template from the Mantra MFS100
   * RD Service. Length cap is generous (real templates are ~512–4096
   * bytes encoded) but bounded to keep the request body sane.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  fingerprintTemplate!: string;
}
