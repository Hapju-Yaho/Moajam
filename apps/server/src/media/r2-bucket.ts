import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Bucket } from './storage-types.js';

async function result<T>(operation: () => Promise<T>): Promise<{ data: T | null; error: unknown }> {
  try {
    return { data: await operation(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export class R2Bucket implements Bucket {
  constructor(
    private readonly client: S3Client,
    private readonly name: string,
  ) {}

  createSignedUploadUrl(key: string, options?: { contentType: string }) {
    return result(async () => {
      if (!options?.contentType) throw new Error('Upload content type is required');
      const headers = { 'Content-Type': options.contentType, 'If-None-Match': '*' };
      const signedUrl = await getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: this.name,
          Key: key,
          ContentType: options.contentType,
          // A still-valid upload link cannot overwrite an already completed file.
          IfNoneMatch: '*',
        }),
        { expiresIn: 300, signableHeaders: new Set(['content-type', 'if-none-match']) },
      );
      return { signedUrl, uploadFormat: 'raw' as const, headers };
    });
  }

  createSignedUrl(key: string, seconds: number) {
    return result(async () => ({
      signedUrl: await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.name, Key: key }),
        { expiresIn: seconds },
      ),
    }));
  }

  info(key: string) {
    return result(async () => {
      const object = await this.client.send(new HeadObjectCommand({ Bucket: this.name, Key: key }));
      return { metadata: { size: object.ContentLength, mimetype: object.ContentType } };
    });
  }

  upload(key: string, data: Buffer, options: { contentType: string }) {
    return result(() =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.name,
          Key: key,
          Body: data,
          ContentType: options.contentType,
          IfNoneMatch: '*',
        }),
      ),
    );
  }

  remove(keys: string[]) {
    return result(() =>
      Promise.all(
        keys.map((Key) => this.client.send(new DeleteObjectCommand({ Bucket: this.name, Key }))),
      ),
    );
  }
}
