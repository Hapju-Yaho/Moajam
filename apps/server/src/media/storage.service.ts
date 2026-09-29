import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIRECTORY } from '../config/database-url.js';
import { ForbiddenException } from '@nestjs/common';
type Result<T> = PromiseLike<{ data: T | null; error: unknown }>;
interface Bucket {
  createSignedUploadUrl(key: string): Result<{ signedUrl: string }>;
  createSignedUrl(key: string, seconds: number): Result<{ signedUrl: string }>;
  info(key: string): Result<{ metadata?: { size?: number; mimetype?: string } }>;
  upload(key: string, data: Buffer, options: { contentType: string }): Result<unknown>;
  remove(keys: string[]): Result<unknown>;
}
@Injectable()
export class StorageService {
  private readonly signingKey = randomBytes(32);
  constructor(private readonly config: ConfigService) {}
  get local() {
    return this.config.get('DATABASE_MODE') === 'sqlite';
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
    return createClient(this.config.getOrThrow<string>('SUPABASE_URL'), secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).storage.from(this.config.get<string>('MEDIA_BUCKET') ?? 'moajam-private');
  }
  async signed(key: string) {
    const { data, error } = await this.bucket().createSignedUrl(key, 300);
    if (error || !data) throw new ServiceUnavailableException('파일 링크를 만들지 못했습니다.');
    return data.signedUrl;
  }
}
