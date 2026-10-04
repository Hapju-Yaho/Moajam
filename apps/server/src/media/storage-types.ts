export type Result<T> = PromiseLike<{ data: T | null; error: unknown }>;
export interface UploadLink {
  signedUrl: string;
  uploadFormat?: 'raw' | 'multipart';
  headers?: Record<string, string>;
}
export interface Bucket {
  createSignedUploadUrl(key: string, options?: { contentType: string }): Result<UploadLink>;
  createSignedUrl(key: string, seconds: number): Result<{ signedUrl: string }>;
  info(key: string): Result<{ metadata?: { size?: number; mimetype?: string } }>;
  upload(key: string, data: Buffer, options: { contentType: string }): Result<unknown>;
  remove(keys: string[]): Result<unknown>;
}
