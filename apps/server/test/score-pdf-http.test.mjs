import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { PDFDocument } from 'pdf-lib';
import { ScorePdfController } from '../dist/score-pdf/score-pdf.controller.js';
import { ScorePdfService } from '../dist/score-pdf/score-pdf.service.js';

test('HTTP multipart upload, authentication, status/result, retry validation, ownership and deletion', async () => {
  const module = await Test.createTestingModule({
    controllers: [ScorePdfController],
    providers: [ScorePdfService],
  }).compile();
  const app = module.createNestApplication(new FastifyAdapter());
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalGuards({
    canActivate(ctx) {
      const req = ctx.switchToHttp().getRequest();
      const owner = req.headers.authorization?.replace(/^Bearer /, '');
      if (!owner) return false;
      req.user = { id: owner };
      return true;
    },
  });
  await app.register(multipart);
  await app.init();
  const server = app.getHttpAdapter().getInstance();
  await server.ready();
  const inject = (url, options = {}) =>
    server.inject({
      url,
      headers: { authorization: 'Bearer alice', ...options.headers },
      ...options,
    });
  try {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = Buffer.from(await doc.save());
    const boundary = 'moajam-pdf-test';
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="score.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upload = await inject('/v1/score-pdf/jobs', {
      method: 'POST',
      headers: {
        authorization: 'Bearer alice',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    assert.equal(upload.statusCode, 201, upload.body);
    assert.equal(
      (
        await inject('/v1/score-pdf/jobs?scoreType=invalid', {
          method: 'POST',
          payload,
          headers: {
            authorization: 'Bearer alice',
            'content-type': `multipart/form-data; boundary=${boundary}`,
          },
        })
      ).statusCode,
      400,
    );
    const job = upload.json();
    assert.equal(job.status, 'prepared');
    assert.equal(job.pages, 1);
    const path = `/v1/score-pdf/jobs/${job.id}`;
    assert.equal((await inject(path)).statusCode, 200);
    assert.equal((await inject(`${path}/result`)).json().result, null);
    assert.equal((await inject(path, { headers: {} })).statusCode, 403);
    assert.equal(
      (await inject(path, { headers: { authorization: 'Bearer bob' } })).statusCode,
      404,
    );
    assert.equal(
      (await inject(`${path}/reanalyze`, { method: 'POST', payload: { page: 2 } })).statusCode,
      400,
    );
    assert.equal(
      (await inject(`${path}/reanalyze`, { method: 'POST', payload: { page: 1 } })).json().accepted,
      false,
    );
    for (const payload of [
      { measures: [] },
      { measures: [{ part: 'p1', page: 1, measure: 1 }], forceInference: 'true' },
      { measures: [{ part: 'p1', page: 0, measure: 1 }] },
      { measures: [{ part: 'p1', page: 1, measure: 1, unexpected: true }] },
    ]) {
      assert.equal(
        (await inject(`${path}/reanalyze-batch`, { method: 'POST', payload })).statusCode,
        400,
      );
    }
    assert.equal(
      (
        await inject(`${path}/reanalyze-batch`, {
          method: 'POST',
          payload: { measures: [{ part: 'p1', page: 1, measure: 1 }] },
          headers: { authorization: 'Bearer bob' },
        })
      ).statusCode,
      404,
    );
    assert.equal((await inject(path, { method: 'DELETE' })).statusCode, 200);
    assert.equal((await inject(path)).statusCode, 404);
  } finally {
    await app.close();
  }
});
