import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { R2Bucket } from './r2-bucket.js';
import { StorageService } from './storage.service.js';
import { validateEnvironment } from '../config/environment.js';
import { MediaController } from './media.controller.js';
import type { PrismaService } from '../common/database/prisma.service.js';
import type { SeparationService } from './separation.service.js';

const settings = {
  STORAGE_PROVIDER: 'r2',
  R2_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_SECRET_ACCESS_KEY: 'test-secret-key',
  R2_BUCKET: 'moajam-private',
};

test('media API returns R2 transfer instructions and verifies metadata and ownership before completion', async (t) => {
  const user = { id: '11111111-1111-4111-8111-111111111111' };
  let asset: Record<string, unknown> = {};
  let completed = false;
  const db = {
    mediaAsset: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        asset = { ...data, id: 'asset', ready: false };
        return asset;
      },
      findUnique: async () => asset,
      update: async () => {
        completed = true;
        return { ...asset, ready: true };
      },
    },
  } as unknown as PrismaService;
  const storage = new StorageService(new ConfigService(validateEnvironment(settings)));
  const controller = new MediaController(db, storage, {} as SeparationService);
  const info = t.mock.method(storage.bucket(), 'info', async () => ({
    data: { metadata: { size: 5, mimetype: 'image/png' } },
    error: null,
  }));
  try {
    const upload = await controller.upload(user, {
      name: 'photo.png',
      mime: 'image/png',
      size: 4,
      scope: 'personal',
    });
    assert.equal(upload.uploadFormat, 'raw');
    assert.deepEqual(upload.headers, { 'Content-Type': 'image/png', 'If-None-Match': '*' });
    assert.ok(String(asset.objectKey).startsWith(user.id + '/'));
    await assert.rejects(controller.complete(user, 'asset'), /크기/);
    assert.equal(completed, false);
    info.mock.mockImplementation(async () => ({
      data: { metadata: { size: 4, mimetype: 'audio/wav' } },
      error: null,
    }));
    await assert.rejects(controller.complete(user, 'asset'), /형식/);
    assert.equal(completed, false);
    info.mock.mockImplementation(async () => ({
      data: { metadata: { size: 4, mimetype: 'image/png' } },
      error: null,
    }));
    await assert.rejects(controller.complete({ id: 'another-user' }, 'asset'));
    assert.equal(completed, false);
    await controller.complete(user, 'asset');
    assert.equal(completed, true);
  } finally {
    storage.onModuleDestroy();
  }
});

test('R2 selection is independent of DB, preserves defaults, and rejects incomplete configuration', () => {
  assert.equal(validateEnvironment({}).STORAGE_PROVIDER, 'local');
  assert.equal(
    validateEnvironment({ DATABASE_URL: 'postgresql://example/db' }).STORAGE_PROVIDER,
    'supabase',
  );
  for (const DATABASE_URL of ['', 'postgresql://example/db']) {
    const config = validateEnvironment({ ...settings, DATABASE_URL });
    const storage = new StorageService(new ConfigService(config));
    assert.equal(storage.local, false);
    assert.throws(() => storage.verify('anything', 'GET'));
    assert.equal(storage.bucket(), storage.bucket());
    storage.onModuleDestroy();
  }
  for (const key of ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'])
    assert.throws(() => validateEnvironment({ ...settings, [key]: '' }), new RegExp(key));
  for (const endpoint of [
    'invalid',
    'http://example.com',
    'https://pub-example.r2.dev',
    `${settings.R2_ENDPOINT}/bucket`,
  ])
    assert.throws(() => validateEnvironment({ ...settings, R2_ENDPOINT: endpoint }), /R2_ENDPOINT/);
  assert.throws(() => validateEnvironment({ ...settings, R2_BUCKET: '../bucket' }), /R2_BUCKET/);
  assert.throws(() => validateEnvironment({ STORAGE_PROVIDER: 'typo' }), /STORAGE_PROVIDER/);
});

test('R2 upload signatures bind MIME and create-only header, expire in five minutes, and omit empty-body checksum', async () => {
  const storage = new StorageService(new ConfigService(validateEnvironment(settings)));
  try {
    for (const contentType of ['image/png', 'audio/mp4', 'audio/webm']) {
      const { data, error } = await storage
        .bucket()
        .createSignedUploadUrl('user/file', { contentType });
      assert.equal(error, null);
      assert.ok(data);
      assert.equal(data.uploadFormat, 'raw');
      assert.deepEqual(data.headers, { 'Content-Type': contentType, 'If-None-Match': '*' });
      const url = new URL(data.signedUrl);
      assert.equal(url.origin, settings.R2_ENDPOINT);
      assert.equal(url.pathname, '/moajam-private/user/file');
      assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
      const signed = url.searchParams.get('X-Amz-SignedHeaders')!.split(';');
      assert.ok(signed.includes('content-type'));
      assert.ok(signed.includes('if-none-match'));
      assert.equal(
        [...url.searchParams.keys()].some((k) => k.toLowerCase().includes('checksum')),
        false,
      );
      assert.equal(data.signedUrl.includes(settings.R2_SECRET_ACCESS_KEY), false);
    }
    const url = new URL(await storage.signed('user/file'));
    assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
    assert.equal(url.searchParams.get('x-id'), 'GetObject');
  } finally {
    storage.onModuleDestroy();
  }
});

test('R2 metadata, worker uploads, cleanup and failures follow the existing storage contract', async (t) => {
  const client = new S3Client({
    region: 'auto',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const bucket = new R2Bucket(client, 'moajam-private');
  const commands: unknown[] = [];
  const send = t.mock.method(client, 'send', async (command: unknown) => {
    commands.push(command);
    return { ContentLength: 4, ContentType: 'audio/wav' };
  });
  try {
    assert.deepEqual(await bucket.info('user/file'), {
      data: { metadata: { size: 4, mimetype: 'audio/wav' } },
      error: null,
    });
    assert.ok(commands[0] instanceof HeadObjectCommand);
    const bytes = Buffer.from([0, 1, 2, 255]);
    assert.equal(
      (await bucket.upload('user/file', bytes, { contentType: 'audio/wav' })).error,
      null,
    );
    assert.ok(commands[1] instanceof PutObjectCommand);
    assert.deepEqual(commands[1].input.Body, bytes);
    assert.equal(commands[1].input.ContentType, 'audio/wav');
    assert.equal(commands[1].input.IfNoneMatch, '*');
    await bucket.remove(['user/file', 'user/other']);
    assert.ok(commands[2] instanceof DeleteObjectCommand);
    assert.ok(commands[3] instanceof DeleteObjectCommand);
    send.mock.mockImplementation(async () => {
      throw new Error('offline');
    });
    for (const value of [
      await bucket.info('missing'),
      await bucket.upload('user/file', bytes, { contentType: 'audio/wav' }),
      await bucket.remove(['missing']),
    ]) {
      assert.equal(value.data, null);
      assert.ok(value.error);
    }
  } finally {
    client.destroy();
  }
});
