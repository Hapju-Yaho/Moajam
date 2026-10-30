import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { ScorePdfService, PDF_MAX_BYTES } from './score-pdf.service.js';
import { MediaController } from '../media/media.controller.js';

async function pdf(pages = 1) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return Buffer.from(await doc.save());
}

test('temporary job list and PDF restoration are owner scoped and deletion updates the list', async () => {
  const service = new ScorePdfService();
  try {
    const bytes = await pdf(2);
    const alice = await service.start('alice', 'alice.pdf', bytes);
    const bob = await service.start('bob', 'bob.pdf', await pdf(1));
    assert.deepEqual(service.list('alice').map(job => job.id), [alice.id]);
    assert.deepEqual(service.list('bob').map(job => job.id), [bob.id]);
    assert.deepEqual(Buffer.from(service.source('alice', alice.id).base64, 'base64'), bytes);
    assert.throws(() => service.source('bob', alice.id));
    assert.throws(() => service.remove('bob', alice.id));
    service.remove('alice', alice.id);
    assert.deepEqual(service.list('alice'), []);
    assert.throws(() => service.source('alice', alice.id));
    assert.equal(service.list('bob').length, 1);
  } finally { service.onModuleDestroy(); }
});

test('cleanup removes only own inactive PDF preparations and keeps current and other users jobs', async () => {
  const service = new ScorePdfService();
  try {
    const old = await service.start('alice', 'old.pdf', await pdf(1));
    const kept = await service.start('alice', 'current.pdf', await pdf(2));
    const other = await service.start('bob', 'other.pdf', await pdf(3));
    assert.deepEqual(service.clearInactive('alice', kept.id), { removed: 1 });
    assert.throws(() => service.status('alice', old.id));
    assert.equal(service.status('alice', kept.id).status, 'prepared');
    assert.equal(service.status('bob', other.id).status, 'prepared');
    assert.equal((await service.start('alice', 'replacement.pdf', await pdf(4))).status, 'prepared');
  } finally { service.onModuleDestroy(); }
});
test('PDF preparation: entire Base64, deduplication, ownership and no fabricated result', async () => {
  const service = new ScorePdfService();
  try {
    const bytes = await pdf(2);
    const job = await service.start('alice', 'score.pdf', bytes);
    assert.equal(job.pages, 2);
    assert.equal(job.status, 'prepared');
    assert.equal(job.analysisEnabled, false);
    assert.equal((await service.start('alice', 'again.pdf', bytes)).id, job.id);
    assert.throws(() => service.status('bob', job.id));
    const request = service.prepareRequest('alice', job.id);
    const file = request.input[0].content.find((c) => c.type === 'input_file');
    assert.equal(
      file && 'file_data' in file ? file.file_data : undefined,
      `data:application/pdf;base64,${bytes.toString('base64')}`,
    );
    assert.equal('model' in request, false);
    assert.equal(service.result('alice', job.id).result, null);
    assert.equal(service.reanalyze('alice', job.id, 2, 3).accepted, false);
    assert.throws(() => service.reanalyze('alice', job.id, 3));
    assert.throws(() => service.reanalyze('alice', job.id, 1, 0));
    service.remove('alice', job.id);
    assert.throws(() => service.status('alice', job.id));
  } finally {
    service.onModuleDestroy();
  }
});
test('reject malformed, renamed, empty, oversized, too many pages and encryption', async () => {
  const service = new ScorePdfService();
  try {
    await assert.rejects(service.start('a', 'a.pdf', Buffer.alloc(0)));
    await assert.rejects(service.start('a', 'a.pdf', Buffer.alloc(PDF_MAX_BYTES + 1)));
    await assert.rejects(service.start('a', 'a.pdf', Buffer.from('%PDF-1.7\ninvalid')));
    await assert.rejects(service.start('a', 'a.txt', await pdf()));
    await assert.rejects(service.start('a', 'a.pdf', await pdf(41)));
    const encrypted = Buffer.from(
      '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 2 0 R >>\n%%EOF',
    );
    await assert.rejects(service.start('a', 'a.pdf', encrypted));
  } finally {
    service.onModuleDestroy();
  }
});
test('preparation cache quotas bound retained data', async () => {
  const service = new ScorePdfService();
  try {
    for (let i = 1; i <= 3; i++) await service.start('a', 'a.pdf', await pdf(i));
    await assert.rejects(service.start('a', 'a.pdf', await pdf(4)), { status: 429 });
  } finally {
    service.onModuleDestroy();
  }
});
test('band PDF list restricts membership, readiness, deletion and private visibility', async () => {
  let filesQuery: unknown;
  const controller = new MediaController(
    {
      workspaceMember: {
        findMany: async (query: unknown) => {
          assert.deepEqual(query, {
            where: { userId: 'alice' },
            select: { workspace: { select: { id: true, name: true } } },
          });
          return [{ workspace: { id: 'band-a', name: 'My band' } }];
        },
      },
      mediaAsset: {
        findMany: async (query: unknown) => {
          filesQuery = query;
          return [
            {
              id: 'pdf-a',
              name: 'Bass.pdf',
              workspaceId: 'band-a',
              size: 100,
              scope: 'song/band-a/song-a',
            },
          ];
        },
      },
    } as never,
    {} as never,
    {} as never,
  );
  const result = await controller.bandPdfs({ id: 'alice' } as never);
  assert.equal(result[0].bandName, 'My band');
  assert.deepEqual((filesQuery as { where: unknown }).where, {
    workspaceId: { in: ['band-a'] },
    mime: 'application/pdf',
    ready: true,
    deletedAt: null,
    OR: [{ ownerId: 'alice' }, { visibility: 'WORKSPACE' }],
  });
});
test('users without bands do not query assets', async () => {
  const controller = new MediaController(
    {
      workspaceMember: { findMany: async () => [] },
      mediaAsset: {
        findMany: async () => {
          throw new Error('must not query assets');
        },
      },
    } as never,
    {} as never,
    {} as never,
  );
  assert.deepEqual(await controller.bandPdfs({ id: 'alice' } as never), []);
});
