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

test('saved boundary lookup uses PDF content and authenticated owner without recognition', async () => {
  const bytes = await pdf();
  let filter: any;
  const record = { key: 'pdf-measures:hash:guitar-tab', updatedAt: new Date(),
    value: { name: 'original.pdf', sourcePages: [3], structure: { parts: [{ id: 'g1', name: '기타 1', measures: [{ page: 1 }] }, { id: 'g2', name: '기타 2', measures: [{ page: 1 }] }] } } };
  const service = new ScorePdfService(undefined, { personalDocument: {
    findMany: async ({ where }: any) => { filter = where; return where.ownerId === 'alice' ? [record] : []; },
  } } as never);
  try {
    const saved = await service.savedStructures('alice', bytes);
    assert.equal(saved[0].structure.parts.length, 2);
    assert.equal(saved[0].structure.parts[0].measures[0].page, 3);
    assert.equal(filter.ownerId, 'alice');
    assert.match(filter.key.startsWith, /^pdf-measures:[a-f0-9]{64}:$/);
    assert.deepEqual(await service.savedStructures('bob', bytes), []);
    await assert.rejects(() => service.savedStructures('alice', Buffer.from('invalid')));
  } finally { service.onModuleDestroy(); }
});

test('measure-only confirmation saves boundaries without starting note recognition', async () => {
  let calls = 0;
  let stored: any;
  const db = { personalDocument: { findUnique: async () => stored, upsert: async ({ create }: any) => { stored = create; return stored; } } };
  const structure = {
    bpm: 120,
    key: null,
    warnings: [],
    parts: [
      {
        id: 'p1',
        name: '기타 1',
        instrument: 'guitar',
        capo: 0,
        tabLines: 6,
        measures: [{ number: 1, page: 1, meter: [4, 4], system: 1, bounds: [20, 100, 980, 300] }],
      },
    ],
  };
  const service = new ScorePdfService({
    enabled: true,
    recognize: async () => {
      calls++;
      return {
        data: structure,
        model: 'fake',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    },
  } as never, db as never);
  try {
    const job = await service.start('alice', 'measure.pdf', await pdf());
    service.analyze('alice', job.id);
    for (let i = 0; i < 100 && service.status('alice', job.id).status === 'analyzing'; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    const result = service.result('alice', job.id);
    assert.equal(result.status, 'structure_review');
    const revision = result.revision;
    const saved = await service.saveStructure('alice', job.id, result.structure, revision);
    assert.equal(saved.status, 'structure_review');
    assert.equal(saved.revision, revision + 1);
    assert.equal(calls, 1);
    await assert.rejects(() => service.saveStructure('alice', job.id, result.structure, revision));
    await assert.rejects(() => service.saveStructure('bob', job.id, result.structure, saved.revision));
    const bytes = service.source('alice', job.id);
    const restored = new ScorePdfService(undefined, db as never);
    try {
      const reopened = await restored.start('alice', 'renamed.pdf', Buffer.from(bytes.base64, 'base64'));
      assert.deepEqual(restored.result('alice', reopened.id).structure, service.result('alice', job.id).structure);
    } finally { restored.onModuleDestroy(); }
  } finally {
    service.onModuleDestroy();
  }
});

test('temporary job list and PDF restoration are owner scoped and deletion updates the list', async () => {
  const service = new ScorePdfService();
  try {
    const bytes = await pdf(2);
    const alice = await service.start('alice', 'alice.pdf', bytes);
    const bob = await service.start('bob', 'bob.pdf', await pdf(1));
    assert.deepEqual(
      service.list('alice').map((job) => job.id),
      [alice.id],
    );
    assert.deepEqual(
      service.list('bob').map((job) => job.id),
      [bob.id],
    );
    assert.deepEqual(Buffer.from(service.source('alice', alice.id).base64, 'base64'), bytes);
    assert.throws(() => service.source('bob', alice.id));
    assert.throws(() => service.remove('bob', alice.id));
    service.remove('alice', alice.id);
    assert.deepEqual(service.list('alice'), []);
    assert.throws(() => service.source('alice', alice.id));
    assert.equal(service.list('bob').length, 1);
  } finally {
    service.onModuleDestroy();
  }
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
    assert.equal(
      (await service.start('alice', 'replacement.pdf', await pdf(4))).status,
      'prepared',
    );
  } finally {
    service.onModuleDestroy();
  }
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
