import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const key = process.argv[2];
if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(key ?? '')) throw new Error('Provide an asset object key (owner UUID/file UUID)');
const config = parse(await readFile(resolve(root, 'apps/server/.env.local'), 'utf8'));
if (config.STORAGE_PROVIDER !== 'r2' || !config.R2_BUCKET || !config.R2_ENDPOINT || !config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY)
  throw new Error('R2 configuration is incomplete');
const path = resolve(root, 'data/files', key);
const original = await readFile(path);
const metadata = JSON.parse(await readFile(`${path}.json`, 'utf8'));
if (metadata.size !== original.length) throw new Error('Local file size differs from metadata');
const client = new S3Client({ region: 'auto', endpoint: config.R2_ENDPOINT, forcePathStyle: true,
  credentials: { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 1 });
const object = { Bucket: config.R2_BUCKET, Key: key };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  let exists = true;
  try { await client.send(new HeadObjectCommand(object)); }
  catch (error) { if (error.$metadata?.httpStatusCode === 404) exists = false; else throw error; }
  if (!exists) {
    await client.send(new PutObjectCommand({ ...object, Body: original,
      ContentType: metadata.mimetype || 'application/octet-stream', IfNoneMatch: '*' }));
  }
  const downloaded = await client.send(new GetObjectCommand(object));
  const bytes = await downloaded.Body.transformToByteArray();
  if (hash(bytes) !== hash(original)) throw new Error('R2 content differs from local original; no existing object was overwritten');
  console.log(JSON.stringify({ status: exists ? 'already-present-verified' : 'copied-and-verified', key, bytes: bytes.length, mime: metadata.mimetype }));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', type: error.name, httpStatus: error.$metadata?.httpStatusCode,
    detail: error.$metadata ? undefined : error.message }));
  process.exitCode = 1;
} finally { client.destroy(); }
