/**
 * Ambient declaration for `aws-sdk` v2.
 *
 * The npm cache on this machine resolved `aws-sdk` to a stale v1.18.0
 * artifact that doesn't ship .d.ts files. The runtime API we use is a
 * tiny subset of the real SDK (S3.putObject + deleteObject), so a
 * minimal shim here keeps the build clean without forcing a re-install
 * or a migration to the modular @aws-sdk/* v3 packages.
 *
 * If/when the package is re-resolved correctly, this file can be deleted.
 */
declare module 'aws-sdk' {
  export interface S3PutObjectInput {
    Bucket: string;
    Key: string;
    Body: Buffer | Uint8Array | Blob | string;
    ContentType?: string;
    ACL?: string;
  }
  export interface S3DeleteObjectInput {
    Bucket: string;
    Key: string;
  }
  export interface S3ClientConfig {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
  }
  interface AwsRequest<T> {
    promise(): Promise<T>;
  }
  export class S3 {
    constructor(config: S3ClientConfig);
    putObject(input: S3PutObjectInput): AwsRequest<unknown>;
    deleteObject(input: S3DeleteObjectInput): AwsRequest<unknown>;
  }
}
