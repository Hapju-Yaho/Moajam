import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, rgb } from 'pdf-lib';
import {
  snapSystemBounds,
  alignStructureToPdfLines,
} from '../dist/score-pdf/structure-line-alignment.js';
import { renderMeasureCrops } from '../dist/score-pdf/measure-crops.js';
import { convertRecognition, mergeRecognition } from '../dist/score-pdf/convert-recognition.js';
import { requestRecognition, RecognitionError } from '../dist/score-pdf/pdf-recognition.client.js';
import { ScorePdfService } from '../dist/score-pdf/score-pdf.service.js';
import { recognitionFixture, event } from './score-pdf-fixture.mjs';
import { recognitionDiagnostics } from '../dist/score-pdf/recognition-diagnostics.js';
import {
  prepareRecognitionRequest,
  prepareStructureRequest,
  applyTabProfile,
} from '../dist/score-pdf/recognition-request.js';
import {
  readStructure,
  recognizedDrumHits,
  reviewRecognition,
  markForcedEstimate,
  normalizeGuitarPartNames,
  normalizeRecognitionPartNames,
} from '../dist/score-pdf/recognition-validation.js';
import {
  validateScoreDocument,
  serializeScoreFile,
  parseScoreFile,
} from '../../../packages/app/src/lib/scoreFile.ts';
import { scoreToMusicXml } from '../../../packages/app/src/lib/score.ts';
import { scoreToMidi } from '../../../packages/app/src/lib/scoreMidi.ts';
import {
  scorePdfExportFiles,
  isolateScorePdfPart,
} from '../../../packages/app/src/lib/scorePdfExport.ts';

const waitUntil = async (predicate) => {
  for (let i = 0; i < 250; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Timed out waiting for local rendering');
};

test('measure close-ups crop actual PDF pixels, preserve identity and are added only when supplied', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 100]);
  page.drawRectangle({ x: 0, y: 0, width: 100, height: 100, color: rgb(1, 0, 0) });
  page.drawRectangle({ x: 100, y: 0, width: 100, height: 100, color: rgb(0, 0, 1) });
  const pdf = Buffer.from(await doc.save());
  const data = recognitionFixture();
  data.parts = [data.parts[0]];
  data.parts[0].measures = [
    { number: 1, page: 1, meter: [4, 4], system: 1, bounds: [0, 0, 500, 1000], events: [] },
    { number: 2, page: 1, meter: [4, 4], system: 1, bounds: [500, 0, 1000, 1000], events: [] },
  ];
  const structure = readStructure(data, 1),
    crops = await renderMeasureCrops(pdf, structure);
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  for (const [i, crop] of crops.entries()) {
    assert.equal(crop.part, 'p1');
    assert.equal(crop.measure, i + 1);
    assert.equal(crop.page, 1);
    assert.ok(crop.width <= 1600 && crop.height <= 1000);
    const image = await loadImage(crop.png),
      canvas = createCanvas(image.width, image.height),
      ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pixel = ctx.getImageData(
      Math.floor(image.width / 2),
      Math.floor(image.height / 2),
      1,
      1,
    ).data;
    assert.equal(pixel[i === 0 ? 0 : 2], 255);
    assert.equal(pixel[i === 0 ? 2 : 0], 0);
  }
  const request = prepareRecognitionRequest('test.pdf', pdf, { page: 1 }, structure, crops);
  const content = request.input[0].content;
  assert.equal(content.filter((c) => c.type === 'input_file').length, 0);
  assert.equal(content.filter((c) => c.type === 'input_image').length, 2);
  assert.ok(
    content.some((c) => c.type === 'input_text' && c.text.includes('cropBounds=[500,0,1000,1000]')),
  );
  assert.equal(
    prepareRecognitionRequest('test.pdf', pdf).input[0].content.filter(
      (c) => c.type === 'input_image',
    ).length,
    0,
  );
  await assert.rejects(() => renderMeasureCrops(pdf, structure, AbortSignal.abort()), {
    code: 'CANCELED',
  });
});

test('recognition request shares structural rules and preserves PDF and reanalysis contract', () => {
  const request = prepareRecognitionRequest('score.pdf', Buffer.from('fixture'), {
    page: 2,
    measure: 55,
  });
  const [instructions, file] = request.input[0].content;
  for (const rule of [
    'Aligned barlines',
    'NEVER unfold repeats',
    'Quarter=[1,1]',
    'eighth-triplet=[1,3]',
    'DEFAULT_METER',
    'UNREADABLE_MEASURE',
    'INSTRUMENT_INFERRED',
    'REPEATS_REVIEW',
  ])
    assert.ok(instructions.text.includes(rule), rule);
  assert.match(instructions.text, /original PDF page 2, written measure 55/);
  assert.equal(file.type, 'input_text');
  assert.match(file.text, /CROP-ONLY REANALYSIS/);
  assert.ok(!request.input[0].content.some((c) => c.type === 'input_file'));
  assert.equal(
    prepareRecognitionRequest('score.pdf', Buffer.from('fixture')).input[0].content[1].file_data,
    'data:application/pdf;base64,Zml4dHVyZQ==',
  );
  assert.equal(request.text.format.strict, true);
});

test('TAB preserves multi-digit frets, triplet rhythm and per-string X in a mixed chord', () => {
  const data = recognitionFixture();
  data.parts = [data.parts[0]];
  data.parts[0].measures = [
    {
      number: 1,
      page: 1,
      meter: [4, 4],
      events: [
        event(
          [0, 1],
          [1, 3],
          [
            { pitch: null, string: 2, fret: null, drum: null, dead: true },
            { pitch: null, string: 1, fret: 12, drum: null, dead: false },
          ],
        ),
        event([1, 3], [1, 3]),
        event([2, 3], [1, 3]),
        event([1, 1], [3, 1], []),
      ],
    },
  ];
  const { score } = convertRecognition(data, 1, 'Mixed TAB');
  const validated = validateScoreDocument(score);
  const tones = validated.notes[0].tones;
  assert.equal(tones[0].dead, true);
  assert.equal(tones[0].string, 2);
  assert.equal(tones[1].fret, 12);
  assert.equal(tones[1].pitch, 76);
  assert.ok(!tones[1].dead);
  assert.equal(validated.notes[0].rest, false);
  assert.equal(
    validated.notes.slice(0, 3).reduce((s, n) => s + n.beats, 0),
    1,
  );
  assert.equal(
    validated.notes.reduce((s, n) => s + n.beats, 0),
    4,
  );
  data.parts[0].measures[0].events[0].notes[0].string = null;
  assert.throws(() => convertRecognition(data, 1, 'Bad X'), /줄 번호/);
});

test('convert TAB, independent guitars, drum voices and piano hands with exact shared bar clocks', async () => {
  const { score, warnings } = convertRecognition(recognitionFixture(), 2, 'Test');
  assert.equal(score.parts.length, 6);
  assert.equal(score.keyboardStaves.Keys, 'Keys LH');
  assert.equal(score.drumVoices.Drums, 'Drums Lower');
  for (const part of score.parts)
    assert.equal(
      score.notes.filter((n) => n.part === part).reduce((s, n) => s + n.beats, 0),
      8,
    );
  const guitar = score.notes.filter((n) => n.part === 'Guitar 1');
  assert.deepEqual(
    guitar.slice(0, 3).map((n) => [n.beats, n.tuplet]),
    [
      [1 / 3, 3],
      [1 / 3, 3],
      [1 / 3, 3],
    ],
  );
  assert.equal(guitar[3].connection.targetId, guitar[4].id);
  assert.equal(guitar[3].connection.type, 'tie');
  assert.equal(score.notes.find((n) => n.part === 'Guitar 2' && !n.rest).tones[0].bend.amount, 2);
  assert.ok(warnings.some((w) => w.code === 'TECHNIQUE_DEFAULTS'));
  const validated = validateScoreDocument(score);
  const moajam = await serializeScoreFile({
    score: validated,
    referenceAudio: null,
    instrumentSample: null,
  });
  assert.equal(parseScoreFile(moajam).score.parts.length, 6);
  const xml = scoreToMusicXml(validated);
  assert.ok(xml.includes('<score-partwise'));
  assert.ok(xml.includes('<technical>'));
  const midi = scoreToMidi(validated);
  assert.equal(new TextDecoder().decode(midi.slice(0, 4)), 'MThd');
});
test('reject invalid rhythms, overlaps, meter disagreement, missing pitch and limits', () => {
  const invalid = [
    (d) => d.parts[0].measures[0].events.push(event([0, 1], [2, 1])),
    (d) => (d.parts[0].measures[0].events[0].duration = [1, 7]),
    (d) => (d.parts[1].measures[0].meter = [3, 4]),
    (d) => (d.parts[3].measures[0].events[0].notes[0].pitch = null),
    (d) => (d.parts[0].measures[0].events[0].duration = [5, 1]),
    (d) => d.warnings.push({ part: 'p1', measure: 1, code: 'LIMIT_EXCEEDED' }),
  ];
  for (const edit of invalid) {
    const d = recognitionFixture();
    edit(d);
    assert.throws(() => convertRecognition(d, 2, 'x'), RecognitionError);
  }
});
test('PDF downloads split logical parts, preserve paired staves and exclude other instruments in all formats', async () => {
  const { score } = convertRecognition(recognitionFixture(), 2, 'Band Song');
  const before = JSON.stringify(score);
  const files = scorePdfExportFiles(score, 'Band Song', 'moajam');
  assert.deepEqual(
    files.map((f) => f.owner),
    ['Guitar 1', 'Guitar 2', 'Drums', 'Keys'],
  );
  assert.deepEqual(
    files.map((f) => f.name),
    [
      'Band Song_Guitar 1.moajam',
      'Band Song_Guitar 2.moajam',
      'Band Song_Drums.moajam',
      'Band Song_Keys.moajam',
    ],
  );
  for (const entry of files) {
    const isolated = validateScoreDocument(isolateScorePdfPart(score, entry.owner));
    const expected =
      entry.owner === 'Keys'
        ? ['Keys', 'Keys LH']
        : entry.owner === 'Drums'
          ? ['Drums', 'Drums Lower']
          : [entry.owner];
    assert.deepEqual(isolated.parts, expected);
    assert.ok(isolated.notes.every((n) => expected.includes(n.part)));
    assert.deepEqual(
      isolated.notes,
      score.notes.filter((n) => expected.includes(n.part)),
    );
    const saved = await serializeScoreFile({
      score: isolated,
      referenceAudio: null,
      instrumentSample: null,
    });
    assert.deepEqual(parseScoreFile(saved).score.parts, expected);
    assert.ok(scoreToMusicXml(isolated).includes('<score-partwise'));
    assert.equal(new TextDecoder().decode(scoreToMidi(isolated).slice(0, 4)), 'MThd');
  }
  assert.equal(JSON.stringify(score), before);
  assert.throws(() => isolateScorePdfPart(score, 'not-a-part'));
  const colliding = { ...score, parts: ['A/B', 'A:B'] };
  const names = scorePdfExportFiles(colliding, 'x'.repeat(100), 'mid').map((f) => f.name);
  assert.equal(new Set(names).size, 2);
});
test('equal duration simultaneous voices form chords; targeted replacement preserves all other measures', () => {
  const d = recognitionFixture();
  d.parts[1].measures[0].events.push(
    event([0, 1], [4, 1], [{ pitch: 59, string: 2, fret: 0, drum: null }], { voice: '2' }),
  );
  assert.equal(
    convertRecognition(d, 2, 'x').score.notes.find((n) => n.part === 'Guitar 2' && !n.rest).tones
      .length,
    2,
  );
  const patch = recognitionFixture();
  patch.parts = patch.parts.map((p) => ({
    ...p,
    measures: p.measures.filter((m) => m.page === 2),
  }));
  patch.parts[0].measures[0].events[0].notes[0].fret = 3;
  const merged = mergeRecognition(d, patch, { page: 2 }, 2);
  assert.deepEqual(merged.parts[0].measures[0], d.parts[0].measures[0]);
  assert.equal(merged.parts[0].measures[1].events[0].notes[0].fret, 3);
  assert.throws(() => mergeRecognition(d, recognitionFixture(), { page: 2 }, 2));
  patch.parts = [];
  assert.throws(() => mergeRecognition(d, patch, { page: 2 }, 2));
});
test('a missing part becomes an explicit warning, not a fabricated empty instrument or total failure', () => {
  const data = recognitionFixture();
  data.parts[1].measures = [];
  const result = convertRecognition(data, 2, 'Partial');
  assert.ok(!result.score.parts.includes('Guitar 2'));
  assert.ok(result.score.parts.includes('Guitar 1'));
  assert.ok(result.warnings.some((w) => w.part === 'Guitar 2' && w.code === 'NO_MEASURES_PART'));
  validateScoreDocument(result.score);
  data.parts.forEach((p) => (p.measures = []));
  assert.throws(() => convertRecognition(data, 2, 'Empty'), /인식된 마디가 없어요/);
});
test('an extracted middle PDF page starts at score bar 1 and retains original numbers for reanalysis', () => {
  const data = recognitionFixture();
  for (const part of data.parts) for (const m of part.measures) m.number += 154;
  data.warnings = [{ part: 'p1', measure: 155, code: 'REVIEW' }];
  const result = convertRecognition(data, 2, 'Middle page');
  assert.equal(result.sourceStartMeasure, 155);
  assert.equal(result.measures, 2);
  assert.equal(result.data.parts[0].measures[0].number, 155);
  assert.ok(result.warnings.some((w) => w.code === 'REVIEW' && w.measure === 1));
  assert.ok(result.warnings.some((w) => w.code === 'MEASURE_NUMBER_REBASED'));
  for (const part of result.score.parts)
    assert.equal(
      result.score.notes.filter((n) => n.part === part).reduce((s, n) => s + n.beats, 0),
      8,
    );
  validateScoreDocument(result.score);
  const patch = structuredClone(data);
  patch.parts.forEach((p) => (p.measures = p.measures.filter((m) => m.page === 2)));
  const merged = mergeRecognition(result.data, patch, { page: 2, measure: 156 }, 2);
  assert.equal(convertRecognition(merged, 2, 'Middle page').sourceStartMeasure, 155);
});
const response = (data, status = 'completed') =>
  new Response(
    JSON.stringify({
      status,
      usage: { input_tokens: 120, output_tokens: 80, total_tokens: 200 },
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }],
    }),
  );
test('Responses transport validates completion, JSON, refusal, safe errors and does not retry', async () => {
  let calls = 0;
  const options = {
    key: 'fake-test-key',
    model: 'gpt-5-mini',
    maxTokens: 12000,
    fetcher: async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(init.body);
      assert.equal(body.store, false);
      assert.equal(body.max_output_tokens, 12000);
      return response(recognitionFixture());
    },
  };
  const reply = await requestRecognition({ input: [], text: {} }, options);
  assert.equal(reply.usage.totalTokens, 200);
  assert.equal(calls, 1);
  await assert.rejects(
    requestRecognition({}, { ...options, fetcher: async () => response({}, 'incomplete') }),
    { code: 'INCOMPLETE_RESPONSE' },
  );
  await assert.rejects(
    requestRecognition(
      {},
      {
        ...options,
        fetcher: async () =>
          new Response(
            JSON.stringify({
              status: 'completed',
              output: [{ type: 'message', content: [{ type: 'refusal' }] }],
            }),
          ),
      },
    ),
    { code: 'REFUSED' },
  );
  await assert.rejects(
    requestRecognition(
      {},
      { ...options, fetcher: async () => new Response('secret api key', { status: 401 }) },
    ),
    (e) => e.code === 'OPENAI_401' && !e.message.includes('secret'),
  );
  await assert.rejects(
    requestRecognition(
      {},
      {
        ...options,
        fetcher: async () =>
          new Response(
            JSON.stringify({
              status: 'completed',
              output: [{ type: 'message', content: [{ type: 'output_text', text: 'not JSON' }] }],
            }),
          ),
      },
    ),
    { code: 'INVALID_JSON' },
  );
});
const pipelineFixture = () => {
  const data = recognitionFixture();
  for (const p of data.parts) for (const m of p.measures) m.reading = 'complete';
  data.parts[2].measures[0].events.push(
    event([1, 1], [3, 1], [], { staff: 'upper' }),
    event([1, 1], [3, 1], [], { staff: 'lower' }),
  );
  return data;
};

test('async jobs call two stages, reuse completed results and retain previous score on failed targeted reanalysis', async () => {
  let calls = 0,
    resolve;
  const service = new ScorePdfService({
    enabled: true,
    recognize: async (payload) => {
      calls++;
      if (payload.text.format.name === 'score_structure')
        return {
          data: readStructure(pipelineFixture(), 2),
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          model: 'fake',
        };
      return new Promise((r) => (resolve = r));
    },
  });
  try {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    const job = await service.start('alice', 'x.pdf', Buffer.from(await doc.save()));
    service.analyze('alice', job.id);
    service.analyze('alice', job.id);
    assert.equal(calls, 1);
    assert.equal(service.status('alice', job.id).status, 'analyzing');
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    assert.equal(service.status('alice', job.id).status, 'structure_review');
    assert.equal(calls, 1);
    const review = service.result('alice', job.id);
    service.confirmStructure('alice', job.id, review.structure, review.revision);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls, 2);
    resolve({
      data: pipelineFixture(),
      usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
      model: 'fake',
    });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(service.status('alice', job.id).status, 'completed');
    assert.equal(service.result('alice', job.id).result.score.parts.length, 6);
    const diagnostics = service.result('alice', job.id).diagnostics;
    assert.equal(diagnostics.outcome, 'completed');
    assert.deepEqual(JSON.parse(diagnostics.outputJson), pipelineFixture());
    assert.equal(diagnostics.stages.length, 2);
    assert.equal(diagnostics.conversion.logicalParts, 4);
    const firstBar = diagnostics.conversion.measures.find(
      (m) => m.part === '기타 1' && m.measure === 1,
    );
    assert.equal(firstBar.actualBeats, 4);
    assert.equal(firstBar.expectedBeats, 4);
    assert.equal(firstBar.tuplets, 3);
    assert.ok(diagnostics.conversionWarnings.some((w) => w.code === 'TECHNIQUE_DEFAULTS'));
    service.analyze('alice', job.id);
    assert.equal(calls, 2);
    assert.equal(service.reanalyze('alice', job.id, 2).accepted, true);
    await waitUntil(() => calls === 3);
    assert.equal(calls, 3);
    resolve({
      data: {},
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      model: 'fake',
    });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(service.status('alice', job.id).status, 'failed');
    assert.equal(service.result('alice', job.id).diagnostics.outcome, 'failed');
    assert.equal(service.result('alice', job.id).diagnostics.outputJson, undefined);
    assert.equal(service.result('alice', job.id).result.score.parts.length, 6);
    assert.equal(service.status('alice', job.id).usage.totalTokens, 217);
    service.analyze('alice', job.id);
    assert.equal(calls, 3);
    assert.throws(() => service.result('bob', job.id));
  } finally {
    service.onModuleDestroy();
  }
});
test('rhythm review reports overflow, overlaps, missing beats, duplicate strings and incomplete tuplets', () => {
  const good = pipelineFixture();
  const structure = readStructure(good, 2);
  assert.deepEqual(reviewRecognition(good, structure), []);
  const bad = structuredClone(good);
  bad.parts[0].measures[0].events = [
    event(
      [0, 1],
      [1, 3],
      [
        { pitch: 64, string: 1, fret: 0, drum: null },
        { pitch: null, string: 1, fret: null, drum: null, dead: true },
      ],
    ),
    event([1, 4], [1, 1]),
    event([10, 3], [1, 1]),
  ];
  const codes = reviewRecognition(bad, structure).map((i) => i.code);
  for (const code of [
    'BAR_OVERFLOW',
    'EVENT_OVERLAP',
    'UNEXPLAINED_GAP',
    'DUPLICATE_STRING',
    'TUPLET_GROUP_REVIEW',
  ])
    assert.ok(codes.includes(code), code);
  bad.parts[0].measures[0].reading = 'unreadable';
  bad.parts[0].measures[0].events = [];
  assert.ok(reviewRecognition(bad, structure).some((i) => i.code === 'UNREADABLE_MEASURE'));
  bad.parts[0].measures[0].reading = 'complete';
  bad.parts[0].measures[0].events = [event()];
  const incompleteIssues = reviewRecognition(bad, structure);
  assert.ok(incompleteIssues.some((i) => i.code === 'INCOMPLETE_BAR' && i.blocking === false));
  assert.ok(
    incompleteIssues
      .filter((i) => i.part === 'p1' && i.measure === 1)
      .every((i) => i.blocking === false),
  );
  const short = pipelineFixture();
  short.parts[0].measures[0].events = [event()];
  assert.ok(reviewRecognition(short, readStructure(short, 2)).every((i) => i.blocking === false));
  assert.ok(
    convertRecognition(short, 2, 'short').warnings.some((w) => w.code === 'GAP_FILLED_WITH_REST'),
  );
});

test('structure geometry rejects overlap, reversed/outside rectangles, wrong row order and stale confirmations without billing', async () => {
  const data = readStructure(pipelineFixture(), 2);
  const part = data.parts[0];
  part.measures[1] = { ...part.measures[1], page: 1, system: 1, bounds: [400, 100, 900, 300] };
  assert.throws(() => readStructure(data, 2), /겹치거나 역순/);
  part.measures[1].bounds = [950, 100, 1000, 300];
  assert.doesNotThrow(() => readStructure(data, 2));
  part.measures[1].bounds = [1000, 100, 900, 300];
  assert.throws(() => readStructure(data, 2), /좌표/);
  part.measures[1].bounds = [950, 100, 1001, 300];
  assert.throws(() => readStructure(data, 2), /좌표/);
  let calls = 0;
  const service = new ScorePdfService({
    enabled: true,
    recognize: async () => {
      calls++;
      return {
        data: readStructure(pipelineFixture(), 2),
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: 'fake',
      };
    },
  });
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    const job = await service.start('alice', 'geometry.pdf', Buffer.from(await pdf.save()));
    service.analyze('alice', job.id);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const review = service.result('alice', job.id);
    assert.equal(review.status, 'structure_review');
    service.analyze('alice', job.id);
    assert.equal(calls, 1);
    assert.throws(() => service.confirmStructure('bob', job.id, review.structure, review.revision));
    assert.throws(
      () => service.confirmStructure('alice', job.id, review.structure, review.revision + 1),
      /최신/,
    );
    const invalid = structuredClone(review.structure);
    invalid.parts[0].measures[0].bounds = [800, 100, 100, 300];
    assert.throws(
      () => service.confirmStructure('alice', job.id, invalid, review.revision),
      /좌표/,
    );
    assert.equal(calls, 1);
    assert.equal(service.result('alice', job.id).status, 'structure_review');
  } finally {
    service.onModuleDestroy();
  }
});

test('failed initial draft can be repaired by one explicit measure call without losing other bars', async () => {
  const good = pipelineFixture();
  const bad = structuredClone(good);
  bad.parts[0].measures[0].reading = 'unreadable';
  bad.parts[0].measures[0].events = [];
  let calls = 0;
  const payloads = [];
  const service = new ScorePdfService({
    enabled: true,
    recognize: async (payload) => {
      payloads.push(payload);
      const data =
        ++calls === 1
          ? readStructure(good, 2)
          : calls === 2
            ? bad
            : {
                ...good,
                parts: good.parts.map((p) => ({
                  ...p,
                  measures: p.measures.filter((m) => m.number === 1),
                })),
              };
      return { data, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, model: 'fake' };
    },
  });
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    const job = await service.start('alice', 'repair.pdf', Buffer.from(await pdf.save()));
    service.analyze('alice', job.id);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const review = service.result('alice', job.id);
    assert.equal(review.status, 'structure_review');
    assert.equal(calls, 1);
    service.confirmStructure('alice', job.id, review.structure, review.revision);
    await new Promise((r) => setTimeout(r, 0));
    const failed = service.result('alice', job.id);
    assert.equal(calls, 2);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error.code, 'SCORE_REVIEW');
    assert.equal(failed.result, null);
    assert.equal(failed.canReanalyze, true);
    assert.equal(failed.issues[0].measure, 1);
    assert.equal(failed.issues[0].page, 1);
    assert.equal(service.reanalyze('alice', job.id, 1, 1).accepted, true);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const repaired = service.result('alice', job.id);
    assert.equal(calls, 3);
    assert.equal(repaired.status, 'completed');
    assert.equal(repaired.usage.totalTokens, 6);
    assert.equal(repaired.result.measures, 2);
    assert.equal(payloads[0].text.format.name, 'score_structure');
    assert.equal(payloads[1].text.format.name, 'score_recognition');
    assert.ok(payloads[1].input[0].content[0].text.includes('Fixed structure'));
    assert.equal(repaired.diagnostics.stages.length, 1);
  } finally {
    service.onModuleDestroy();
  }
});

test('batch review repairs only selected parts and bars across pages with a single call', async () => {
  const good = pipelineFixture(),
    bad = structuredClone(good);
  bad.parts[0].measures[0].reading = 'unreadable';
  bad.parts[0].measures[0].events = [];
  bad.parts[1].measures[1].reading = 'unreadable';
  bad.parts[1].measures[1].events = [];
  const targets = [
    { part: 'p1', page: 1, measure: 1 },
    { part: 'p2', page: 2, measure: 2 },
  ];
  let calls = 0;
  const requests = [];
  const service = new ScorePdfService({
    enabled: true,
    recognize: async (payload) => {
      requests.push(payload);
      const data =
        ++calls === 1
          ? readStructure(good, 2)
          : calls === 2
            ? bad
            : {
                ...good,
                parts: good.parts
                  .filter((p) => targets.some((t) => t.part === p.id))
                  .map((p) => ({
                    ...p,
                    measures: p.measures.filter((m) =>
                      targets.some(
                        (t) => t.part === p.id && t.page === m.page && t.measure === m.number,
                      ),
                    ),
                  })),
              };
      return { data, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, model: 'fake' };
    },
  });
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    const job = await service.start('alice', 'batch.pdf', Buffer.from(await pdf.save()));
    service.analyze('alice', job.id);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const review = service.result('alice', job.id);
    service.confirmStructure('alice', job.id, review.structure, review.revision);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(service.result('alice', job.id).status, 'failed');
    assert.throws(() => service.reanalyzeBatch('bob', job.id, targets));
    assert.throws(() => service.reanalyzeBatch('alice', job.id, []));
    assert.throws(() =>
      service.reanalyzeBatch('alice', job.id, [{ part: 'p1', page: 2, measure: 1 }]),
    );
    assert.equal(calls, 2);
    service.reanalyzeBatch('alice', job.id, [...targets, targets[0]]);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const result = service.result('alice', job.id);
    assert.equal(calls, 3);
    assert.equal(result.status, 'completed');
    assert.equal(result.diagnostics.measureCrops.length, 2);
    assert.equal(requests[2].input[0].content.filter((c) => c.type === 'input_image').length, 2);
    assert.equal(requests[1].input[0].content.filter((c) => c.type === 'input_image').length, 0);
    assert.equal(result.result.score.parts.length, 6);
    assert.equal(result.result.measures, 2);
    assert.equal(result.usage.totalTokens, 6);
    const text = requests[2].input[0].content[0].text;
    assert.ok(text.includes('TWO additional times'));
    assert.ok(text.includes('ONLY these exact part/page/written-measure targets'));
    assert.ok(text.includes(JSON.stringify(targets)));
    assert.equal(
      result.result.score.notes.filter((n) => n.part === '기타 2').reduce((n, m) => n + m.beats, 0),
      8,
    );
  } finally {
    service.onModuleDestroy();
  }
});

test('uncertainty details preserve separate glyphs and reasons while invalid coordinates fall back to the measure', () => {
  const raw = pipelineFixture(),
    structure = readStructure(raw, 2);
  const bar = raw.parts[0].measures[0];
  bar.reading = 'unreadable';
  bar.events = [];
  bar.uncertainties = [
    {
      kind: 'fret',
      reason: '프렛 숫자가 10인지 13인지 불명확해요.',
      bounds: [100, 120, 130, 150],
      eventIndex: 2,
    },
    {
      kind: 'tuplet',
      reason: '셋잇단 표시와 빔의 연결이 불명확해요.',
      bounds: [200, 130, 230, 170],
      eventIndex: 3,
    },
    {
      kind: 'string',
      reason: '줄 위치를 확인해야 해요.',
      bounds: [0, 0, 1001, 1001],
      eventIndex: null,
    },
  ];
  const issues = reviewRecognition(raw, structure);
  assert.equal(issues.length, 3);
  assert.equal(issues[0].source, 'model');
  assert.equal(issues[0].kind, 'fret');
  assert.equal(issues[0].eventIndex, 2);
  assert.deepEqual(issues[0].bounds, [100, 120, 130, 150]);
  assert.match(issues[1].message, /셋잇단/);
  assert.equal(issues[2].bounds, undefined);
  bar.uncertainties = [null];
  assert.equal(reviewRecognition(raw, structure)[0].code, 'UNREADABLE_MEASURE');
});

test('editable rhythm estimates are exported with warnings while invalid timing remains blocking', async () => {
  const data = pipelineFixture();
  const bar = data.parts[0].measures[0];
  bar.reading = 'estimated';
  bar.events = [event([0, 1], [2, 1]), event([2, 1], [2, 1])];
  bar.uncertainties = [
    {
      kind: 'rhythm',
      reason: '4분음표로는 부족해 2분음표 두 개로 추정했어요.',
      bounds: [100, 120, 130, 150],
      eventIndex: 1,
    },
  ];
  const structure = readStructure(data, 2);
  const issues = reviewRecognition(data, structure);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].blocking, false);
  const invalid = structuredClone(data);
  invalid.parts[0].measures[0].reading = 'complete';
  invalid.parts[0].measures[0].uncertainties = [];
  invalid.parts[0].measures[0].events[1].duration = [3, 1];
  assert.ok(
    reviewRecognition(invalid, structure).some(
      (i) => i.code === 'BAR_OVERFLOW' && i.blocking !== false,
    ),
  );
  invalid.parts[0].measures[0].events = [];
  invalid.parts[0].measures[0].reading = 'estimated';
  assert.ok(reviewRecognition(invalid, structure).some((i) => i.code === 'ESTIMATE_EMPTY'));
  let calls = 0;
  const service = new ScorePdfService({
    enabled: true,
    recognize: async () => ({
      data: ++calls === 1 ? structure : data,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      model: 'fake',
    }),
  });
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    const job = await service.start('alice', 'estimate.pdf', Buffer.from(await pdf.save()));
    service.analyze('alice', job.id);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const review = service.result('alice', job.id);
    service.confirmStructure('alice', job.id, review.structure, review.revision);
    await new Promise((r) => setTimeout(r, 0));
    const result = service.result('alice', job.id);
    assert.equal(calls, 2);
    assert.equal(result.status, 'completed');
    assert.ok(result.warnings.some((w) => w.code === 'RHYTHM_ESTIMATED'));
    assert.equal(result.issues[0].blocking, false);
    assert.ok(validateScoreDocument(result.result.score));
    const request = prepareRecognitionRequest(
      'example.pdf',
      Buffer.from('fixture'),
      undefined,
      structure,
    );
    const text = request.input[0].content[0].text;
    assert.ok(text.includes('first try quarter notes [1,1]'));
    assert.ok(text.includes('try half notes [2,1]'));
    assert.ok(text.includes('dotted quarter=[3,2]'));
    assert.ok(text.includes('same arithmetic applies to rests'));
  } finally {
    service.onModuleDestroy();
  }
});

test('overfull estimates preserve notes and bar alignment across parts in editable exports; ambiguous ties can be omitted', async () => {
  const raw = pipelineFixture();
  const bar = raw.parts[0].measures[0];
  bar.reading = 'estimated';
  bar.events = [event([0, 1], [2, 1]), event([2, 1], [3, 1])];
  bar.uncertainties = [
    { kind: 'rhythm', reason: '읽힌 길이를 보존한 추정이에요.', bounds: null, eventIndex: null },
  ];
  const structure = readStructure(raw, 2),
    issues = reviewRecognition(raw, structure);
  assert.ok(issues.some((i) => i.code === 'ESTIMATED_BAR_OVERFLOW' && i.blocking === false));
  assert.ok(!issues.some((i) => i.blocking !== false));
  const { score, warnings } = convertRecognition(raw, 2, 'Overfull');
  const valid = validateScoreDocument(score);
  assert.equal(valid.timeSignature.beats, 4);
  for (const p of valid.parts) {
    assert.equal(valid.measureLengths[p][0], 5);
    assert.equal(valid.measureLengths[p][1], 4);
  }
  assert.equal(
    valid.notes.filter((n) => n.part === 'Guitar 1').reduce((s, n) => s + n.beats, 0),
    9,
  );
  assert.ok(warnings.some((w) => w.code === 'ESTIMATED_BAR_ALIGNMENT'));
  assert.ok(scoreToMusicXml(valid).includes('implicit="yes"'));
  assert.ok(scoreToMidi(valid, ['Guitar 1']));
  assert.ok(await serializeScoreFile({ score: valid, audio: null }));
  const tied = pipelineFixture();
  tied.parts[0].measures[0].events.forEach((e) => (e.tie = 'none'));
  tied.parts[0].measures[0].uncertainties = [
    { kind: 'tie', reason: '붙임줄인지 불명확해 생략했어요.', bounds: null, eventIndex: null },
  ];
  tied.warnings.push({ part: 'p1', measure: 1, code: 'TIE_OMITTED' });
  assert.ok(reviewRecognition(tied, readStructure(tied, 2)).every((i) => i.blocking === false));
});

test('second-stage transport failure retains first-stage usage without automatic retry', async () => {
  let calls = 0;
  const service = new ScorePdfService({
    enabled: true,
    recognize: async () => {
      if (++calls === 1)
        return {
          data: readStructure(pipelineFixture(), 2),
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          model: 'fake',
        };
      throw new RecognitionError('OPENAI_CONNECTION', 'Mock disconnect');
    },
  });
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    const job = await service.start('alice', 'failure.pdf', Buffer.from(await pdf.save()));
    service.analyze('alice', job.id);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const review = service.result('alice', job.id);
    service.confirmStructure('alice', job.id, review.structure, review.revision);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls, 2);
    assert.equal(service.result('alice', job.id).usage.totalTokens, 15);
    assert.equal(service.result('alice', job.id).error.code, 'OPENAI_CONNECTION');
  } finally {
    service.onModuleDestroy();
  }
});

test('empty-parts failure exposes bounded diagnostic JSON only to its owner and clears it on retry', async () => {
  const service = new ScorePdfService({
    enabled: true,
    recognize: async () => ({
      data: {
        bpm: null,
        key: null,
        parts: [],
        warnings: [{ part: 'Guitar 2', measure: 0, code: 'UNREADABLE_TAB' }],
      },
      usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      model: 'fake-model',
    }),
  });
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const job = await service.start('alice', 'x.pdf', Buffer.from(await pdf.save()));
    service.analyze('alice', job.id);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const failed = service.result('alice', job.id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.diagnostics.phase, 'response');
    assert.equal(failed.diagnostics.parts.length, 0);
    assert.equal(failed.diagnostics.warnings[0].code, 'UNREADABLE_TAB');
    assert.ok(failed.diagnostics.outputExcerpt.includes('"parts": []'));
    assert.equal(service.status('alice', job.id).diagnostics, undefined);
    assert.throws(() => service.result('bob', job.id));
    service.analyze('alice', job.id, true);
    assert.equal(service.result('alice', job.id).diagnostics, undefined);
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    service.onModuleDestroy();
  }
});
test('diagnostics redact secrets and PDF payloads and bound output length', () => {
  const secret = 'test-secret-not-a-real-key';
  const data = {
    parts: [],
    warnings: [{ part: secret, measure: 0, code: 'EMPTY' }],
    api_key: secret,
    file_data: 'data:application/pdf;base64,' + 'A'.repeat(900),
    message: secret,
    other: 'x'.repeat(30000),
  };
  const diag = recognitionDiagnostics(
    data,
    '',
    { phase: 'conversion', model: secret, jsonParsed: true },
    secret,
  );
  const saved = JSON.stringify(diag);
  assert.ok(!saved.includes(secret));
  assert.ok(!saved.includes('A'.repeat(100)));
  assert.ok(diag.outputExcerpt.length <= 20000);
  // A long base64-like string may be redacted before it needs truncating.
  const clipped = recognitionDiagnostics(undefined, 'word '.repeat(10000), { phase: 'response' });
  assert.equal(clipped.outputExcerpt.length, 20000);
  assert.equal(clipped.excerptTruncated, true);
});
test('successful diagnostic download can contain complete redacted JSON beyond preview length', () => {
  const data = {
    parts: [],
    warnings: [],
    text: 'sample word '.repeat(3000),
    api_key: 'private-test-key',
  };
  const diagnostic = recognitionDiagnostics(
    data,
    '',
    { phase: 'conversion', jsonParsed: true },
    'private-test-key',
    true,
  );
  assert.ok(diagnostic.excerptTruncated);
  assert.equal(diagnostic.outputExcerpt.length, 20000);
  assert.equal(JSON.parse(diagnostic.outputJson).text, data.text);
  assert.ok(!diagnostic.outputJson.includes('private-test-key'));
});
test('incomplete Responses preserve reason, partial text and reasoning usage without another call', async () => {
  let calls = 0;
  await assert.rejects(
    requestRecognition(
      {},
      {
        key: 'fake-only',
        model: 'test-model',
        maxTokens: 12000,
        fetcher: async () => {
          calls++;
          return new Response(
            JSON.stringify({
              id: 'resp_test',
              status: 'incomplete',
              incomplete_details: { reason: 'max_output_tokens' },
              usage: {
                input_tokens: 200,
                output_tokens: 12000,
                total_tokens: 12200,
                output_tokens_details: { reasoning_tokens: 11000 },
              },
              output: [{ type: 'message', content: [{ type: 'output_text', text: '{"parts":[' }] }],
            }),
            { headers: { 'x-request-id': 'req_test' } },
          );
        },
      },
    ),
    (e) => {
      assert.equal(e.diagnostics.incompleteReason, 'max_output_tokens');
      assert.equal(e.diagnostics.reasoningTokens, 11000);
      assert.equal(e.diagnostics.requestId, 'req_test');
      assert.equal(e.diagnostics.responseId, 'resp_test');
      assert.equal(e.diagnostics.outputExcerpt, '{"parts":[');
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('forced inference preserves selected guesses across later normal repairs and strips connections', async () => {
  const good = pipelineFixture(),
    uncertain = structuredClone(good);
  const bar = uncertain.parts[0].measures[0];
  bar.reading = 'estimated';
  bar.uncertainties = [{ kind: 'fret', reason: 'Guessed fret', bounds: null, eventIndex: 1 }];
  bar.events[0].tie = 'start';
  const structure = readStructure(good, 2);
  assert.ok(reviewRecognition(uncertain, structure).some((i) => i.blocking !== false));
  const guessed = markForcedEstimate(uncertain);
  assert.equal(guessed.parts[0].measures[0].events[0].tie, 'none');
  assert.deepEqual(guessed.parts[0].measures[0].events[0].techniques, []);
  const first = { part: 'p1', page: 1, measure: 1 },
    second = { part: 'p2', page: 2, measure: 2 };
  let calls = 0;
  const requests = [];
  const service = new ScorePdfService({
    enabled: true,
    recognize: async (payload) => {
      requests.push(payload);
      calls++;
      const selected = calls === 3 ? first : second;
      const data =
        calls === 1
          ? structure
          : calls === 2
            ? uncertain
            : {
                ...good,
                parts: (calls === 3 ? uncertain : good).parts
                  .filter((p) => p.id === selected.part)
                  .map((p) => ({
                    ...p,
                    measures: p.measures.filter(
                      (m) => m.number === selected.measure && m.page === selected.page,
                    ),
                  })),
              };
      return { data, model: 'fake' };
    },
  });
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    const job = await service.start('alice', 'force.pdf', Buffer.from(await pdf.save()));
    service.analyze('alice', job.id);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const review = service.result('alice', job.id);
    service.confirmStructure('alice', job.id, review.structure, review.revision);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    assert.equal(service.status('alice', job.id).status, 'failed');
    service.reanalyzeBatch('alice', job.id, [first], true);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    assert.equal(service.status('alice', job.id).status, 'completed');
    assert.ok(requests[2].input[0].content[0].text.includes('FORCED EDITABLE INFERENCE MODE'));
    assert.ok(service.result('alice', job.id).warnings.some((w) => w.code === 'FORCED_INFERENCE'));
    service.reanalyzeBatch('alice', job.id, [second]);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    assert.equal(service.status('alice', job.id).status, 'completed');
    assert.ok(!requests[3].input[0].content[0].text.includes('FORCED EDITABLE INFERENCE MODE'));
    assert.equal(calls, 4);
  } finally {
    service.onModuleDestroy();
  }
});

test('part diagnostics reject swapped names and suppress another part region reason', () => {
  const data = pipelineFixture();
  const structure = readStructure(data, 2);
  data.parts[0].name = data.parts[1].name;
  assert.ok(reviewRecognition(data, structure).some((i) => i.code === 'PART_IDENTITY_MISMATCH'));
  data.parts[0].name = structure.parts[0].name;
  structure.parts[0].measures[0].bounds = [0, 0, 1000, 300];
  structure.parts[1].measures[0].bounds = [0, 500, 1000, 800];
  data.parts[0].measures[0].uncertainties = [
    { kind: 'fret', reason: 'OTHER_PART_REASON', bounds: [100, 550, 150, 600], eventIndex: 1 },
  ];
  const issues = reviewRecognition(data, structure);
  assert.ok(issues.some((i) => i.code === 'ISSUE_PART_MISMATCH' && i.part === 'p1'));
  assert.ok(!issues.some((i) => i.message === 'OTHER_PART_REASON'));
});

test('guitar aliases normalize by fixed identity, including a p2-only retry', () => {
  const data = pipelineFixture();
  data.parts[0].name = 'Guitar 1&2';
  data.parts[1].name = 'lower guitar';
  const named = normalizeGuitarPartNames(data);
  assert.deepEqual(
    named.parts.slice(0, 2).map((p) => p.name),
    ['\uAE30\uD0C0 1', '\uAE30\uD0C0 2'],
  );
  const fixed = readStructure(named, 2);
  const patch = normalizeGuitarPartNames({ ...data, parts: [data.parts[1]] }, fixed);
  assert.equal(patch.parts[0].name, '\uAE30\uD0C0 2');
  assert.equal(patch.parts[0].id, 'p2');
  assert.equal(named.parts[2].name, data.parts[2].name);
});

test('bass TAB profile uses four strings, sounding bass tuning and independent preparation jobs', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  const guitar = prepareStructureRequest('bass.pdf', bytes);
  const bass = applyTabProfile(guitar, 'bass-tab');
  const text = bass.input[0].content[0].text;
  assert.ok(text.includes('FOUR parallel'));
  assert.ok(text.includes('tabLines must be 4'));
  assert.ok(!text.includes('Do not infer bass, piano'));
  assert.ok(text.includes('G2=43, D2=38, A1=33, E1=28'));
  assert.deepEqual(bass.text.format.schema.properties.parts.items.properties.instrument.enum, [
    'bass',
    'bassHalfDown',
    'bassDropD',
  ]);
  assert.deepEqual(guitar.text.format.schema.properties.parts.items.properties.instrument.enum, [
    'guitar',
    'dropD',
    'guitarHalfDown',
  ]);
  assert.equal(bass.input[0].content[1].file_data, guitar.input[0].content[1].file_data);
  const service = new ScorePdfService();
  try {
    const first = await service.start('alice', 'bass.pdf', bytes, 'bass-tab');
    const second = await service.start('alice', 'bass.pdf', bytes, 'guitar-tab');
    assert.notEqual(first.id, second.id);
    assert.equal((await service.start('alice', 'bass.pdf', bytes, 'bass-tab')).id, first.id);
    assert.ok(
      service.prepareRequest('alice', first.id).input[0].content[0].text.includes('BASS PROFILE'),
    );
  } finally {
    service.onModuleDestroy();
  }
  const data = pipelineFixture();
  data.parts = [data.parts[0]];
  data.parts[0].instrument = 'bass';
  for (const m of data.parts[0].measures)
    for (const e of m.events) {
      if (e.notes.length) e.notes = [{ ...e.notes[0], string: 1, fret: 0, pitch: null }];
    }
  data.parts[0].measures[0].tabLines = 4;
  const named = normalizeGuitarPartNames(data);
  assert.equal(named.parts[0].name, '\uBCA0\uC774\uC2A4 1');
  const converted = convertRecognition(named, 2, 'bass');
  assert.ok(converted.score.notes.some((n) => !n.rest && n.pitch === 43));
  const bad = structuredClone(named);
  bad.parts[0].measures[0].events[0].notes[0].string = 5;
  assert.throws(() => convertRecognition(bad, 2, 'bass'));
  const forced = applyTabProfile(
    prepareRecognitionRequest('bass.pdf', bytes, undefined, undefined, [], true),
    'bass-tab',
  );
  assert.ok(forced.input[0].content[0].text.includes('1..4'));
  assert.ok(!forced.input[0].content[0].text.includes('1..6'));
});

test('guitar and bass omitted TAB systems retain numbered rests and inherit meter', () => {
  for (const instrument of ['guitar', 'bass']) {
    const data = pipelineFixture();
    data.parts = [data.parts[0]];
    const part = data.parts[0];
    part.instrument = instrument;
    const first = part.measures[0],
      last = structuredClone(first);
    first.number = 76;
    first.meter = [3, 4];
    first.events = [event([0, 1], [3, 1], [{ pitch: null, string: 1, fret: 0, drum: null }])];
    last.number = 87;
    last.events = [event([0, 1], [3, 1], [{ pitch: null, string: 1, fret: 0, drum: null }])];
    last.meter = [3, 4];
    last.system = 2;
    last.bounds = [0, 500, 1000, 700];
    part.measures = [first, last];
    const structure = readStructure(data, 2);
    assert.equal(structure.parts[0].measures[1].number, 87);
    assert.deepEqual(reviewRecognition(data, structure), []);
    const result = convertRecognition(data, 2, 'missing TAB');
    assert.equal(result.measures, 12);
    assert.equal(result.sourceStartMeasure, 76);
    assert.equal(result.warnings.filter((w) => w.code === 'MISSING_MEASURE_REST').length, 10);
    assert.equal(
      result.score.notes.reduce((sum, n) => sum + n.beats, 0),
      36,
    );
    assert.equal(result.score.notes.filter((n) => n.rest).length, 10);
    const invalid = structuredClone(data);
    invalid.parts[0].measures[1].number = 76;
    assert.throws(() => readStructure(invalid, 2));
  }
});

test('vocal staff profile replaces TAB rules and preserves sounding pitches through the complete job', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  const structureRequest = applyTabProfile(
    prepareStructureRequest('vocal.pdf', bytes),
    'vocal-staff',
  );
  const text = structureRequest.input[0].content[0].text;
  assert.ok(text.includes('explicitly INCLUDE the pitched five-line staff'));
  assert.ok(!text.includes('IGNORE ALL FIVE-LINE STAFF'));
  assert.ok(text.includes('Lyrics are not required') || text.includes('UNPITCHED DRUM'));
  assert.ok(!text.includes('TAB BOUNDARY EVIDENCE'));
  assert.ok(text.includes('Treble staff bottom-to-top lines E4 G4 B4 D5 F5'));
  assert.ok(text.includes('local sharp/flat/natural overrides'));
  assert.deepEqual(
    structureRequest.text.format.schema.properties.parts.items.properties.instrument.enum,
    ['standard'],
  );
  const tones = (pitch) => [{ pitch, string: null, fret: null, drum: null, dead: false }];
  const data = {
    bpm: 90,
    key: 1,
    warnings: [],
    parts: [
      {
        id: 'p1',
        name: 'Vocal 1',
        instrument: 'standard',
        capo: 0,
        tabLines: null,
        measures: [
          {
            number: 1,
            page: 1,
            meter: [4, 4],
            system: 1,
            bounds: [50, 100, 950, 400],
            reading: 'complete',
            uncertainties: [],
            events: [
              event([0, 1], [1, 1], tones(64)),
              event([1, 1], [1, 1], tones(66)),
              event([2, 1], [1, 1], []),
              event([3, 1], [1, 1], tones(67)),
            ],
          },
        ],
      },
    ],
  };
  let calls = 0;
  const requests = [];
  const service = new ScorePdfService({
    enabled: true,
    recognize: async (payload) => {
      calls++;
      requests.push(payload);
      return { data: calls === 1 ? readStructure(data, 1) : structuredClone(data), model: 'fake' };
    },
  });
  try {
    const job = await service.start('alice', 'vocal.pdf', bytes, 'vocal-staff');
    assert.equal(job.scoreType, 'vocal-staff');
    service.analyze('alice', job.id);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const review = service.result('alice', job.id);
    assert.equal(review.status, 'structure_review');
    service.confirmStructure('alice', job.id, review.structure, review.revision);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const result = service.result('alice', job.id);
    assert.equal(result.status, 'completed');
    const score = result.result.score;
    assert.deepEqual(
      score.notes.filter((n) => !n.rest).map((n) => n.pitch),
      [64, 66, 67],
    );
    assert.equal(score.notes.filter((n) => n.rest).length, 1);
    assert.equal(
      score.notes.reduce((sum, n) => sum + n.beats, 0),
      4,
    );
    assert.equal(score.keySignature, 1);
    assert.ok(requests[1].input[0].content[0].text.includes(JSON.stringify(review.structure)));
    assert.ok(requests[1].input[0].content[0].text.includes('Ignore lyrics extraction'));
    service.reanalyzeBatch('alice', job.id, [{ part: 'p1', page: 1, measure: 1 }], true);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    assert.equal(service.status('alice', job.id).status, 'completed');
    assert.ok(requests[2].input[0].content[0].text.includes('FORCED EDITABLE INFERENCE MODE'));
    assert.equal(requests[2].input[0].content.filter((c) => c.type === 'input_image').length, 1);
    assert.ok(
      requests[2].input[0].content[2].text.includes('noteheads/pitches/accidentals/rhythm'),
    );
    assert.ok(!requests[2].input[0].content[0].text.includes('choose the most plausible fret'));
  } finally {
    service.onModuleDestroy();
  }
  const named = normalizeRecognitionPartNames(data, 'vocal-staff');
  const fixed = readStructure(named, 1);
  named.parts[0].measures[0].events[0].notes[0].pitch = null;
  assert.ok(reviewRecognition(named, fixed).some((i) => i.code === 'INVALID_PITCH'));
  assert.throws(() => convertRecognition(named, 1, 'bad vocal'));
});

test('two-hand keyboard keeps one bar clock and confirmed key, with unknown key defaulting to C', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  const request = applyTabProfile(prepareStructureRequest('piano.pdf', bytes), 'keyboard');
  const text = request.input[0].content[0].text;
  assert.ok(text.includes('TWO-HAND KEYBOARD GRAND STAFF'));
  assert.ok(text.includes('encloses BOTH right/left staves'));
  assert.ok(text.includes('FIRST-MEASURE KEY SIGNATURE'));
  assert.ok(text.includes('use key:0 (C major / no key signature)'));
  assert.ok(!text.includes('USER-CONFIRMED INPUT TYPE: VOCAL'));
  assert.deepEqual(request.text.format.schema.properties.parts.items.properties.instrument.enum, [
    'piano',
  ]);
  const tone = (pitch) => ({ pitch, string: null, fret: null, drum: null, dead: false });
  const data = {
    bpm: 100,
    key: 2,
    warnings: [],
    parts: [
      {
        id: 'p1',
        name: 'Piano 1',
        instrument: 'piano',
        capo: 0,
        tabLines: null,
        measures: [
          {
            number: 1,
            page: 1,
            system: 1,
            bounds: [50, 100, 950, 500],
            meter: [4, 4],
            reading: 'complete',
            uncertainties: [],
            events: [
              event([0, 1], [2, 1], [tone(66), tone(69)], { staff: 'right' }),
              event([2, 1], [2, 1], [tone(73)], { staff: 'right' }),
              event([0, 1], [4, 1], [tone(38)], { staff: 'left' }),
            ],
          },
        ],
      },
    ],
  };
  const unknown = normalizeRecognitionPartNames({ ...data, key: null }, 'keyboard');
  assert.equal(unknown.key, 0);
  assert.ok(unknown.warnings.some((w) => w.code === 'KEY_DEFAULT_C'));
  assert.equal(convertRecognition(unknown, 1, 'unknown').score.keySignature, 0);
  let calls = 0;
  const requests = [];
  const service = new ScorePdfService({
    enabled: true,
    recognize: async (payload) => {
      calls++;
      requests.push(payload);
      return {
        data: calls === 1 ? readStructure(data, 1) : { ...structuredClone(data), key: -3 },
        model: 'fake',
      };
    },
  });
  try {
    const job = await service.start('alice', 'piano.pdf', bytes, 'keyboard');
    assert.equal(job.scoreType, 'keyboard');
    service.analyze('alice', job.id);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const review = service.result('alice', job.id);
    assert.equal(review.status, 'structure_review');
    assert.equal(review.structure.parts.length, 1);
    service.confirmStructure('alice', job.id, review.structure, review.revision);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const result = service.result('alice', job.id);
    assert.equal(result.status, 'completed');
    const score = result.result.score;
    assert.equal(score.keySignature, 2);
    assert.equal(result.result.measures, 1);
    const main = score.parts.find((p) => score.keyboardStaves[p]),
      left = score.keyboardStaves[main];
    assert.ok(main && left);
    assert.equal(
      score.notes.filter((n) => n.part === main).reduce((s, n) => s + n.beats, 0),
      4,
    );
    assert.equal(
      score.notes.filter((n) => n.part === left).reduce((s, n) => s + n.beats, 0),
      4,
    );
    assert.deepEqual(
      score.notes.filter((n) => n.part === left && !n.rest).map((n) => n.pitch),
      [38],
    );
    assert.equal(score.instruments[left], 'pianoBass');
    assert.ok(requests[1].input[0].content[0].text.includes(JSON.stringify(review.structure)));
    service.reanalyzeBatch('alice', job.id, [{ part: 'p1', page: 1, measure: 1 }], true);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    assert.equal(service.status('alice', job.id).status, 'completed');
    assert.ok(requests[2].input[0].content[0].text.includes('FORCED EDITABLE INFERENCE MODE'));
    assert.equal(requests[2].input[0].content.filter((c) => c.type === 'input_image').length, 1);
  } finally {
    service.onModuleDestroy();
  }
});

test('drum profile preserves kit chords, triplets and upper/lower voice clocks without TAB X semantics', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  const request = applyTabProfile(prepareStructureRequest('drums.pdf', bytes), 'drums');
  const text = request.input[0].content[0].text;
  assert.ok(text.includes('UNPITCHED DRUM KIT PERCUSSION STAFF'));
  assert.ok(text.includes('printed drum legend/instrument labels FIRST'));
  assert.ok(text.includes('NOT rests, TAB ghost notes'));
  assert.ok(text.includes('closed-hi-hat42, open-hi-hat46, pedal-hi-hat44'));
  assert.ok(!text.includes('USER-CONFIRMED INPUT TYPE: VOCAL'));
  assert.ok(!text.includes('IGNORE ALL FIVE-LINE STAFF'));
  assert.deepEqual(request.text.format.schema.properties.parts.items.properties.instrument.enum, [
    'drums',
  ]);
  const hit = (pitch) => ({ pitch, string: null, fret: null, drum: null, dead: false });
  const data = {
    bpm: 110,
    key: 2,
    warnings: [],
    parts: [
      {
        id: 'p1',
        name: 'Drums 1',
        instrument: 'drums',
        capo: 0,
        tabLines: null,
        measures: [
          {
            number: 1,
            page: 1,
            meter: [4, 4],
            system: 1,
            bounds: [50, 100, 950, 400],
            reading: 'complete',
            uncertainties: [],
            events: [
              event([0, 1], [1, 3], [hit(42), hit(38)], { staff: 'upper' }),
              event([1, 3], [1, 3], [hit(42)], { staff: 'upper' }),
              event([2, 3], [1, 3], [hit(46)], { staff: 'upper' }),
              ...[1, 2, 3].map((n) => event([n, 1], [1, 1], [hit(49)], { staff: 'upper' })),
              event([0, 1], [2, 1], [hit(36)], { staff: 'lower' }),
              event([2, 1], [2, 1], [], { staff: 'lower' }),
            ],
          },
        ],
      },
    ],
  };
  let calls = 0;
  const requests = [];
  const service = new ScorePdfService({
    enabled: true,
    recognize: async (payload) => {
      requests.push(payload);
      calls++;
      const result = calls === 1 ? readStructure(data, 1) : structuredClone(data);
      if (calls === 3)
        result.parts[0].measures[0].uncertainties = [
          { kind: 'drum', reason: 'hi hat estimate', bounds: null, eventIndex: 1 },
        ];
      return { data: result, model: 'fake' };
    },
  });
  try {
    const job = await service.start('alice', 'drums.pdf', bytes, 'drums');
    assert.equal(job.scoreType, 'drums');
    service.analyze('alice', job.id);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const review = service.result('alice', job.id);
    assert.equal(review.status, 'structure_review');
    assert.equal(review.structure.parts.length, 1);
    service.confirmStructure('alice', job.id, review.structure, review.revision);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const result = service.result('alice', job.id);
    assert.equal(result.status, 'completed');
    const score = result.result.score,
      main = score.parts.find((p) => score.drumVoices[p]),
      lower = score.drumVoices[main];
    assert.equal(score.keySignature, 0);
    assert.equal(result.result.measures, 1);
    assert.ok(main && lower);
    for (const part of [main, lower])
      assert.equal(
        score.notes.filter((n) => n.part === part).reduce((s, n) => s + n.beats, 0),
        4,
      );
    assert.ok(score.notes.some((n) => n.tones.some((t) => t.pitch === 46)));
    assert.ok(score.notes.some((n) => n.tones.length === 2));
    assert.ok(score.notes.every((n) => n.tones.every((t) => !t.dead)));
    assert.ok(requests[1].input[0].content[0].text.includes(JSON.stringify(review.structure)));
    service.reanalyzeBatch('alice', job.id, [{ part: 'p1', page: 1, measure: 1 }], true);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    assert.equal(service.status('alice', job.id).status, 'completed');
    assert.ok(requests[2].input[0].content[0].text.includes('FORCED EDITABLE INFERENCE MODE'));
    assert.ok(!requests[2].input[0].content[0].text.includes('choose the most plausible fret'));
    assert.equal(requests[2].input[0].content.filter((c) => c.type === 'input_image').length, 1);
    assert.ok(
      service.result('alice', job.id).issues.some((i) => i.kind === 'drum' && i.blocking === false),
    );
  } finally {
    service.onModuleDestroy();
  }
  const named = normalizeRecognitionPartNames(data, 'drums'),
    fixed = readStructure(named, 1);
  named.parts[0].measures[0].events[0].notes[0].pitch = 64;
  assert.ok(
    reviewRecognition(named, fixed).some(
      (i) => i.code === 'DRUM_MAPPING_REVIEW' && i.blocking !== false,
    ),
  );
});

test('all score profiles preserve one multibar-rest box and expand confirmed silence without missing-bar warnings', async () => {
  for (const type of ['guitar-tab', 'bass-tab', 'vocal-staff', 'keyboard', 'drums']) {
    const instrument = {
      'guitar-tab': 'guitar',
      'bass-tab': 'bass',
      'vocal-staff': 'standard',
      keyboard: 'piano',
      drums: 'drums',
    }[type];
    const data = {
      bpm: 120,
      key: 0,
      warnings: [],
      parts: [
        {
          id: 'p1',
          name: 'Test',
          instrument,
          capo: 0,
          tabLines: null,
          measures: [
            {
              number: 77,
              page: 1,
              system: 1,
              bounds: [50, 100, 700, 400],
              meter: [4, 4],
              restCount: 10,
              reading: 'complete',
              uncertainties: [],
              events: [],
            },
            {
              number: 87,
              page: 1,
              system: 1,
              bounds: [700, 100, 950, 400],
              meter: [4, 4],
              restCount: null,
              reading: 'complete',
              uncertainties: [],
              events: [],
            },
          ],
        },
      ],
    };
    const structure = readStructure(data, 1);
    assert.equal(structure.parts[0].measures.length, 2);
    assert.equal(structure.parts[0].measures[0].restCount, 10);
    assert.deepEqual(reviewRecognition(data, structure), []);
    const converted = convertRecognition(data, 1, 'rest');
    assert.equal(converted.measures, 11);
    for (const part of converted.score.parts)
      assert.equal(
        converted.score.notes.filter((n) => n.part === part).reduce((sum, n) => sum + n.beats, 0),
        44,
      );
    assert.ok(converted.score.notes.every((n) => n.rest));
    assert.ok(!converted.warnings.some((w) => w.code === 'MISSING_MEASURE_REST'));
    assert.equal(
      parseScoreFile(await serializeScoreFile({ score: converted.score, audio: null })).score.parts
        .length,
      converted.score.parts.length,
    );
    const overlap = structuredClone(data);
    overlap.parts[0].measures[1].number = 80;
    assert.throws(() => readStructure(overlap, 1));
    const wrong = structuredClone(data);
    wrong.parts[0].measures[0].events = [event()];
    assert.throws(() => convertRecognition(wrong, 1, 'wrong'));
    const mismatch = structuredClone(data);
    mismatch.parts[0].measures[0].restCount = 9;
    assert.ok(reviewRecognition(mismatch, structure).some((i) => i.code === 'STRUCTURE_MISMATCH'));
    const payload = applyTabProfile(prepareStructureRequest('rest.pdf', Buffer.from('test')), type);
    const text = payload.input[0].content[0].text;
    assert.ok(text.includes('MULTI-MEASURE REST GROUPS'));
    assert.ok(text.includes('HORIZONTAL CONTENT SAFETY'));
    assert.ok(text.includes('SYSTEM HORIZONTAL ANCHORS'));
    assert.ok(text.includes('Do NOT divide the page width'));
    assert.ok(text.includes('COORDINATE AND DRIFT CHECK'));
    assert.ok(text.includes('move the corresponding edge inward'));
    assert.ok(
      payload.text.format.schema.properties.parts.items.properties.measures.items.required.includes(
        'restCount',
      ),
    );
  }
});

test('staff evidence snaps page-margin drift to real nonuniform barlines without changing height', () => {
  const width = 1000,
    height = 300;
  const make = (count, paired = false) => {
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
    const black = (x, y) => {
      const i = (y * width + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
    };
    for (const start of paired ? [70, 180] : [70]) {
      for (let j = 0; j < count; j++) for (let x = 80; x <= 930; x++) black(x, start + j * 10);
      for (const x of [80, 260, 480, 750, 930])
        for (let y = start; y <= start + (count - 1) * 10; y++) black(x, y);
      // A full-height note stem with a wide head is not a separating barline.
      for (let y = start; y <= start + (count - 1) * 10; y++) black(205, y);
      for (let y = start + 10; y < start + 14; y++) for (let x = 199; x <= 211; x++) black(x, y);
    }
    return pixels;
  };
  const bounds = [
    [20, 180, 220, 900],
    [220, 180, 500, 900],
    [500, 180, 750, 900],
    [750, 180, 980, 900],
  ];
  for (const count of [4, 5, 6]) {
    const result = snapSystemBounds(make(count), width, height, bounds, count);
    assert.deepEqual(
      result.map((b) => [b[0], b[2]]),
      [
        [80, 260],
        [260, 480],
        [480, 750],
        [750, 930],
      ],
    );
    assert.ok(result.every((b) => b[1] === 180 && b[3] === 900));
  }
  assert.ok(snapSystemBounds(make(5, true), width, height, bounds, 5, true));
  assert.equal(snapSystemBounds(make(6), width, height, bounds, 5), null);
  assert.equal(
    snapSystemBounds(new Uint8ClampedArray(width * height * 4).fill(255), width, height, bounds, 5),
    null,
  );
});

test('PDF line alignment corrects initial structure and records before/after without paid calls', async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([1000, 300]);
  for (let j = 0; j < 5; j++)
    page.drawLine({
      start: { x: 80, y: 230 - j * 10 },
      end: { x: 930, y: 230 - j * 10 },
      thickness: 1,
    });
  for (const x of [80, 260, 480, 750, 930])
    page.drawLine({ start: { x, y: 190 }, end: { x, y: 230 }, thickness: 1 });
  const bounds = [
    [20, 150, 220, 450],
    [220, 150, 500, 450],
    [500, 150, 750, 450],
    [750, 150, 980, 450],
  ];
  const structure = {
    bpm: 120,
    key: 0,
    warnings: [],
    parts: [
      {
        id: 'p1',
        name: 'Drums',
        instrument: 'drums',
        capo: 0,
        tabLines: null,
        measures: bounds.map((b, i) => ({
          number: i + 1,
          page: 1,
          system: 1,
          meter: [4, 4],
          bounds: b,
        })),
      },
    ],
  };
  const result = await alignStructureToPdfLines(Buffer.from(await pdf.save()), structure);
  assert.equal(result.corrections.length, 1);
  const rows = result.structure.parts[0].measures;
  assert.ok(Math.abs(rows[0].bounds[0] - 80) <= 2);
  assert.ok(Math.abs(rows.at(-1).bounds[2] - 930) <= 2);
  assert.ok(Math.abs(rows[0].bounds[2] - 260) <= 2);
  assert.deepEqual(structure.parts[0].measures[0].bounds, bounds[0]);
  assert.doesNotThrow(() => readStructure(result.structure, 1));
});

test('drum head variants preserve per-hit rimshot and roll notation without retiming other kit hits', async () => {
  const hit = (pitch, drum) => ({ pitch, drum, string: null, fret: null, dead: false });
  const raw = {
    bpm: 120,
    key: 0,
    warnings: [],
    parts: [
      {
        id: 'p1',
        name: 'Drums',
        instrument: 'drums',
        capo: 0,
        tabLines: null,
        measures: [
          {
            number: 64,
            page: 1,
            meter: [4, 4],
            system: 1,
            bounds: [50, 100, 950, 400],
            reading: 'complete',
            uncertainties: [],
            events: [
              event(
                [0, 1],
                [4, 1],
                [hit(38, 'snare-rimshot'), hit(42, 'closed-hi-hat'), hit(50, 'tom-roll2')],
                { staff: 'upper' },
              ),
              event([0, 1], [4, 1], [hit(44, 'pedal-hi-hat')], { staff: 'lower' }),
            ],
          },
        ],
      },
    ],
  };
  const result = convertRecognition(raw, 1, 'drum variants'),
    tones = result.score.notes.flatMap((n) => n.tones);
  assert.equal(tones.find((t) => t.pitch === 38).drumTechnique, 'rimshot');
  assert.equal(tones.find((t) => t.pitch === 50).drumTechnique, 'roll2');
  assert.equal(tones.find((t) => t.pitch === 42).drumTechnique, undefined);
  assert.equal(tones.find((t) => t.pitch === 44).drumTechnique, undefined);
  for (const p of result.score.parts)
    assert.equal(
      result.score.notes.filter((n) => n.part === p).reduce((s, n) => s + n.beats, 0),
      4,
    );
  const saved = parseScoreFile(await serializeScoreFile({ score: result.score, audio: null }));
  assert.ok(saved.score.notes.some((n) => n.tones.some((t) => t.drumTechnique === 'rimshot')));
  const forced = convertRecognition(markForcedEstimate(raw), 1, 'forced');
  assert.ok(forced.score.notes.every((n) => n.tones.every((t) => !t.drumTechnique)));
  const text = applyTabProfile(prepareRecognitionRequest('drum.pdf', Buffer.from('test')), 'drums')
    .input[0].content[0].text;
  for (const phrase of [
    'DOCUMENT-WIDE KIT ROW CATALOG',
    'PERSISTENT CYMBAL TEXT DIRECTIONS',
    'SLASH SHAPE DISAMBIGUATION',
    'not by bar number alone',
    'snare-rimshot',
    'tom-roll2',
  ])
    assert.ok(text.includes(phrase), phrase);
});

test('drum coverage distinguishes confirmed rests from missing hits and preserves editable estimated attacks', async () => {
  const hit = (pitch) => ({ pitch, drum: null, string: null, fret: null, dead: false });
  const data = {
    bpm: 120,
    key: 0,
    warnings: [],
    parts: [
      {
        id: 'p1',
        name: 'Drums',
        instrument: 'drums',
        capo: 0,
        tabLines: null,
        measures: [
          {
            number: 1,
            page: 1,
            system: 1,
            bounds: [50, 100, 950, 400],
            meter: [4, 4],
            reading: 'estimated',
            uncertainties: [],
            drumCoverage: {
              upper: { status: 'partial', visibleHits: 8 },
              lower: { status: 'rest', visibleHits: 0 },
            },
            events: [event([0, 1], [1, 1], [hit(49)], { staff: 'upper' })],
          },
        ],
      },
    ],
  };
  data.scoreContext = 'p1: Closed H.H.; kick below staff; legend not printed';
  data.parts[0].measures[0].events[0].notes[0].position = [200, 250];
  const fixed = readStructure(data, 1);
  let issues = reviewRecognition(data, fixed, [], true);
  assert.ok(issues.some((i) => i.code === 'DRUM_HIT_OMISSION' && i.voice === 'upper'));
  assert.ok(!issues.some((i) => i.voice === 'lower'));
  assert.ok(issues.every((i) => i.blocking === false));
  const complete = structuredClone(data),
    bar = complete.parts[0].measures[0];
  bar.reading = 'complete';
  bar.drumCoverage.upper = { status: 'complete', visibleHits: 1 };
  bar.events[0].duration = [4, 1];
  assert.deepEqual(reviewRecognition(complete, readStructure(complete, 1), [], true), []);
  bar.events = [];
  bar.drumCoverage.upper = { status: 'rest', visibleHits: 0 };
  assert.deepEqual(reviewRecognition(complete, readStructure(complete, 1), [], true), []);
  const gap = structuredClone(data);
  gap.parts[0].measures[0].events.push(event([2, 1], [2, 1], [hit(42)], { staff: 'upper' }));
  assert.ok(reviewRecognition(gap, fixed, [], true).every((i) => i.blocking === false));
  const uncertain = structuredClone(data);
  uncertain.parts[0].measures[0].uncertainties = [
    { kind: 'drum', reason: 'kit estimate', bounds: null, eventIndex: 1 },
  ];
  assert.ok(reviewRecognition(uncertain, fixed, [], true).every((i) => i.blocking === false));
  const missing = structuredClone(data);
  delete missing.parts[0].measures[0].drumCoverage;
  assert.equal(
    reviewRecognition(missing, fixed, [], true).filter((i) => i.code === 'DRUM_COVERAGE_MISSING')
      .length,
    2,
  );
  let calls = 0;
  const requests = [];
  const service = new ScorePdfService({
    enabled: true,
    recognize: async (payload) => {
      requests.push(payload);
      calls++;
      return { data: calls === 1 ? fixed : structuredClone(data), model: 'fake' };
    },
  });
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const job = await service.start('alice', 'partial.pdf', Buffer.from(await pdf.save()), 'drums');
    service.analyze('alice', job.id);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const review = service.result('alice', job.id);
    service.confirmStructure('alice', job.id, review.structure, review.revision);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    const result = service.result('alice', job.id);
    assert.equal(result.status, 'completed');
    assert.ok(result.result);
    assert.equal(result.recognizedHits.length, 1);
    assert.equal(result.recognizedHits[0].pitch, 49);
    assert.equal(calls, 2); // No automatic retry.
    const located = structuredClone(data);
    located.parts[0].measures[0].events[0].notes[0].position = [200, 250];
    assert.deepEqual(recognizedDrumHits(located, fixed), [
      { part: 'p1', page: 1, measure: 1, voice: 'upper', pitch: 49, x: 200, y: 250 },
    ]);
    located.parts[0].measures[0].events[0].notes[0].position = [200, 450];
    assert.deepEqual(recognizedDrumHits(located, fixed), []);
    const schema =
      requests[1].text.format.schema.properties.parts.items.properties.measures.items.properties
        .events.items.properties.notes.items;
    assert.ok(schema.required.includes('position'));
    service.reanalyze('alice', job.id, 1, 1);
    await waitUntil(() => service.status('alice', job.id).status !== 'analyzing');
    assert.equal(calls, 3);
    assert.ok(JSON.stringify(requests[2]).includes('kick below staff'));
    assert.deepEqual(
      recognizedDrumHits(
        {
          parts: [
            null,
            {
              id: 'p1',
              instrument: 'drums',
              measures: [null, { page: 1, number: 1, events: [null, { notes: [null] }] }],
            },
          ],
        },
        fixed,
      ),
      [],
    );
    assert.ok(!requests[2].input[0].content.some((c) => c.type === 'input_file'));
    assert.equal(requests[2].input[0].content.filter((c) => c.type === 'input_image').length, 1);

    assert.equal(requests[0].input[0].content.filter((c) => c.type === 'input_image').length, 0);
    assert.equal(requests[1].input[0].content.filter((c) => c.type === 'input_image').length, 0);
    assert.ok(result.issues.some((i) => i.code === 'DRUM_HIT_OMISSION'));
    assert.ok(result.warnings.some((i) => i.code === 'DRUM_HIT_OMISSION'));
    assert.ok(result.message.includes('\uB204\uB77D'));
    assert.deepEqual(result.diagnostics.measureCrops, []);
  } finally {
    service.onModuleDestroy();
  }
});

test('crop-only retries carry bounded structural legends without resending PDF bytes', () => {
  const data = recognitionFixture();
  data.scoreContext = 'p1: Closed H.H. from bar 1, Ride from bar 8; printed legend unknown';
  const fixed = readStructure(data, 2, false);
  assert.equal(fixed.scoreContext, data.scoreContext);
  const req = applyTabProfile(
    prepareRecognitionRequest(
      'test.pdf',
      Buffer.from('PDF-SHOULD-NOT-BE-SENT'),
      { page: 1, measure: 1 },
      fixed,
      [
        {
          part: 'p1',
          page: 1,
          measure: 1,
          bounds: [0, 0, 1000, 1000],
          width: 100,
          height: 100,
          png: Buffer.from('PNG'),
        },
      ],
    ),
    'drums',
    { structure: fixed, target: { page: 1, measure: 1 } },
  );
  assert.ok(
    !JSON.stringify(req).includes(Buffer.from('PDF-SHOULD-NOT-BE-SENT').toString('base64')),
  );
  assert.ok(JSON.stringify(req).includes('Ride from bar 8'));
  assert.ok(JSON.stringify(req).includes('CROP-ONLY REANALYSIS'));
  const structure = prepareStructureRequest('test.pdf', Buffer.from('PDF'));
  assert.ok(structure.text.format.schema.required.includes('scoreContext'));
  assert.ok(structure.input[0].content.some((c) => c.type === 'input_file'));
  data.scoreContext = 'x'.repeat(9000);
  assert.equal(readStructure(data, 2, false).scoreContext.length, 6000);
});
