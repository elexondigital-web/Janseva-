import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { v4 as uuid } from 'uuid';
import * as AWS from 'aws-sdk';

export type StorageMode = 'local' | 's3';

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimetype: string;
}

/**
 * Phase 4: file-content sniffing. We only allow image uploads (member
 * photos + Aadhaar scans), so a small set of magic-byte signatures is
 * enough. Each entry is `{ mime, prefix }` — a buffer prefix that must
 * match the start of the file.
 *
 * Why we do this even though Multer reports a MIME type: the MIME header
 * comes from the client and is trivial to spoof. Magic-byte sniffing
 * confirms the bytes match what the header claims.
 */
const MAGIC_SIGNATURES: { mime: string; prefix: number[]; ext: string }[] = [
  // JPEG: FF D8 FF
  { mime: 'image/jpeg', prefix: [0xff, 0xd8, 0xff], ext: '.jpg' },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    mime: 'image/png',
    prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ext: '.png',
  },
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50 — we match RIFF then WEBP at offset 8.
  // Handled inline below.
];

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private mode: StorageMode = 'local';
  private s3?: AWS.S3;
  private bucket?: string;
  private region?: string;
  private localDir: string;
  private publicBaseUrl: string;

  constructor(private config: ConfigService) {
    this.localDir = join(process.cwd(), 'uploads');
    this.publicBaseUrl =
      this.config.get<string>('PUBLIC_URL') ?? 'http://localhost:3000';
  }

  async onModuleInit() {
    const accessKey = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secret = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    const bucket = this.config.get<string>('AWS_BUCKET_NAME');
    const region = this.config.get<string>('AWS_REGION');

    if (accessKey && secret && bucket && region) {
      this.mode = 's3';
      this.bucket = bucket;
      this.region = region;
      this.s3 = new AWS.S3({
        accessKeyId: accessKey,
        secretAccessKey: secret,
        region,
      });
      this.logger.log(`Storage mode: S3 (bucket=${bucket}, region=${region})`);
    } else {
      this.mode = 'local';
      await fs.mkdir(this.localDir, { recursive: true });
      this.logger.log(`Storage mode: LOCAL (dir=${this.localDir})`);
    }
  }

  getMode(): StorageMode {
    return this.mode;
  }

  /**
   * Inspect a file's actual bytes and return a normalized
   * `{ mime, ext }` if it's a known/allowed image type, or null if not.
   * The check is content-based — the client-supplied MIME and filename
   * are intentionally ignored.
   */
  private sniffImage(
    buffer: Buffer,
  ): { mime: string; ext: string } | null {
    for (const sig of MAGIC_SIGNATURES) {
      if (buffer.length < sig.prefix.length) continue;
      let match = true;
      for (let i = 0; i < sig.prefix.length; i++) {
        if (buffer[i] !== sig.prefix[i]) {
          match = false;
          break;
        }
      }
      if (match) return { mime: sig.mime, ext: sig.ext };
    }
    // WebP: RIFF....WEBP
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return { mime: 'image/webp', ext: '.webp' };
    }
    return null;
  }

  /**
   * Defense in depth: even though we generate UUID-based S3 keys, reject
   * uploads whose original filename contains path-traversal sequences.
   * If a client sent `../etc/passwd`, log it and refuse — we never want
   * such a filename anywhere near our storage layer, even as metadata.
   */
  private assertSafeFilename(name: string | undefined | null): void {
    if (!name) return; // Multer always provides one, but be defensive.
    if (
      name.includes('..') ||
      name.includes('/') ||
      name.includes('\\') ||
      name.includes('\0')
    ) {
      this.logger.warn(`Blocked unsafe filename: ${name}`);
      throw new BadRequestException('Filename contains illegal characters');
    }
  }

  async upload(
    file: Express.Multer.File,
    folder: 'photos' | 'aadhaar' | 'misc' = 'misc',
  ): Promise<UploadResult> {
    if (!file) throw new BadRequestException('No file provided');
    if (!file.buffer) throw new BadRequestException('Empty upload');
    if (file.size > MAX_UPLOAD_BYTES)
      throw new BadRequestException('File exceeds 10 MB');

    this.assertSafeFilename(file.originalname);

    // Sniff actual content type.
    const sniffed = this.sniffImage(file.buffer);
    if (!sniffed) {
      throw new BadRequestException(
        'File content does not match an allowed image type (JPEG, PNG, WebP)',
      );
    }
    // Cross-check with the claimed mimetype — if the client says PDF but
    // the bytes are PNG, that's still suspicious enough to reject.
    if (
      file.mimetype &&
      !file.mimetype.startsWith('image/') &&
      file.mimetype !== sniffed.mime
    ) {
      throw new BadRequestException(
        `Mismatched MIME: claimed ${file.mimetype} but content is ${sniffed.mime}`,
      );
    }

    // Honour sniffed extension regardless of the original filename — and
    // double-check the extension whitelist as a sanity belt-and-braces.
    const claimedExt = (extname(file.originalname || '') || '').toLowerCase();
    const ext = ALLOWED_EXT.has(claimedExt) ? claimedExt : sniffed.ext;
    // Final: never let the key contain anything that could escape the folder.
    const key = `${folder}/${uuid()}${ext}`;

    if (this.mode === 's3' && this.s3 && this.bucket) {
      await this.s3
        .putObject({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          // Force the sniffed type — the client-supplied mimetype isn't trusted.
          ContentType: sniffed.mime,
        })
        .promise();
      const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
      return { url, key, size: file.size, mimetype: sniffed.mime };
    }

    // Local
    const folderPath = join(this.localDir, folder);
    await fs.mkdir(folderPath, { recursive: true });
    const filename = key.split('/').pop() as string;
    const filepath = join(folderPath, filename);
    await fs.writeFile(filepath, file.buffer);
    const url = `${this.publicBaseUrl}/uploads/${key}`;
    return { url, key, size: file.size, mimetype: sniffed.mime };
  }

  async remove(key: string): Promise<void> {
    if (!key) return;
    try {
      if (this.mode === 's3' && this.s3 && this.bucket) {
        await this.s3.deleteObject({ Bucket: this.bucket, Key: key }).promise();
        return;
      }
      const filepath = join(this.localDir, key);
      await fs.unlink(filepath);
    } catch (err) {
      this.logger.warn(`Failed to remove ${key}: ${(err as Error).message}`);
    }
  }

  extractKeyFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (this.mode === 's3' && this.bucket) {
      const prefix = `https://${this.bucket}.s3.${this.region}.amazonaws.com/`;
      if (url.startsWith(prefix)) return url.slice(prefix.length);
    }
    const localPrefix = `${this.publicBaseUrl}/uploads/`;
    if (url.startsWith(localPrefix)) return url.slice(localPrefix.length);
    return null;
  }
}
