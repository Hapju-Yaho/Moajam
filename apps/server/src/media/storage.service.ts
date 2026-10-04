import { Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIRECTORY } from '../config/database-url.js';
import { ForbiddenException } from '@nestjs/common';
import { R2Bucket } from './r2-bucket.js';
import type { Bucket } from './storage-types.js';
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly signingKey = randomBytes(32);
  private r2Client?: S3Client;
  private r2Bucket?: R2Bucket;
  constructor(private readonly config: ConfigService) {}
  get provider() {
    return (
      this.config.get<string>('STORAGE_PROVIDER') ||
      (this.config.get('DATABASE_MODE') === 'sqlite' ? 'local' : 'supabase')
    );
  }
  get local() {
    return this.provider === 'local';
  }
  onModuleDestroy() {
    this.r2Client?.destroy();
  }
  private path(key: string) {
    if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(key)) throw new ForbiddenException();
    return join(DATA_DIRECTORY, 'files', key);
  }
  private link(key: string, method: string) {
    const payload = Buffer.from(
      JSON.stringify({ key, method, expires: Date.now() + 300000 }),
    ).toString('base64url');
    const signature = createHmac('sha256', this.signingKey).update(payload).digest('base64url');
    return `${this.config.get<string>('PUBLIC_API_URL') || `http://127.0.0.1:${this.config.get('PORT')}/v1`}/local-files/${payload}.${signature}`;
  }
  verify(token: string, method: string): string {
    if (!this.local) throw new ForbiddenException();
    const [payload = '', signature = ''] = token.split('.');
    const expected = createHmac('sha256', this.signingKey).update(payload).digest('base64url');
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new ForbiddenException();
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      key: string;
      method: string;
      expires: number;
    };
    if (data.expires < Date.now() || data.method !== method)
      throw new ForbiddenException('파일 링크가 만료되었습니다.');
    this.path(data.key);
    return data.key;
  }
  async read(key: string) {
    return readFile(this.path(key));
  }
  async write(key: string, data: Buffer, mime: string) {
    const path = this.path(key);
    await mkdir(join(DATA_DIRECTORY, 'files', key.split('/')[0]), { recursive: true });
    await writeFile(path, data, { flag: 'wx' });
    await writeFile(`${path}.json`, JSON.stringify({ size: data.length, mimetype: mime }));
  }
  bucket(): Bucket {
    if (this.provider === 'r2') {
      if (!this.r2Bucket) {
        const endpoint = this.config.get<string>('R2_ENDPOINT');
        const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
        const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
        const name = this.config.get<string>('R2_BUCKET');
        if (!endpoint || !accessKeyId || !secretAccessKey || !name)
          throw new ServiceUnavailableException('R2 파일 저장소 설정이 필요합니다.');
        this.r2Client = new S3Client({
          region: 'auto',
          endpoint,
          forcePathStyle: true,
          credentials: { accessKeyId, secretAccessKey },
          // Do not sign an SDK-generated checksum for an empty presigning body.
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
        });
        this.r2Bucket = new R2Bucket(this.r2Client, name);
      }
      return this.r2Bucket;
    }
    if (this.local)
      return {
        createSignedUploadUrl: async (key: string) => ({
          data: { signedUrl: this.link(key, 'PUT') },
          error: null,
        }),
        createSignedUrl: async (key: string) => ({
          data: { signedUrl: this.link(key, 'GET') },
          error: null,
        }),
        info: async (key: string) => {
          try {
            return {
              data: {
                metadata: JSON.parse(await readFile(`${this.path(key)}.json`, 'utf8')) as {
                  size: number;
                  mimetype: string;
                },
              },
              error: null,
            };
          } catch (error) {
            return { data: null, error };
          }
        },
        upload: async (key: string, data: Buffer, options: { contentType: string }) => {
          try {
            await this.write(key, data, options.contentType);
            return { data: { path: key }, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
        remove: async (keys: string[]) => {
          try {
            for (const key of keys) {
              await unlink(this.path(key)).catch((error) => {
                if (error.code !== 'ENOENT') throw error;
              });
              await unlink(`${this.path(key)}.json`).catch((error) => {
                if (error.code !== 'ENOENT') throw error;
              });
            }
            return { data: [], error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
      };
    const secret = this.config.get<string>('SUPABASE_SECRET_KEY');
    if (!secret) throw new ServiceUnavailableException('파일 저장소가 연결되지 않았습니다.');
    const bucket = createClient(this.config.getOrThrow<string>('SUPABASE_URL'), secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).storage.from(this.config.get<string>('MEDIA_BUCKET') ?? 'moajam-private');
    return {
      createSignedUploadUrl: (key) => bucket.createSignedUploadUrl(key),
      createSignedUrl: (key, seconds) => bucket.createSignedUrl(key, seconds),
      info: (key) => bucket.info(key),
      upload: (key, data, options) => bucket.upload(key, data, options),
      remove: (keys) => bucket.remove(keys),
    };
  }
  async signed(key: string) {
    const { data, error } = await this.bucket().createSignedUrl(key, 300);
    if (error || !data) throw new ServiceUnavailableException('파일 링크를 만들지 못했습니다.');
    return data.signedUrl;
  }
}
