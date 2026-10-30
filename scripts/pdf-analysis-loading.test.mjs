import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { moduleUrl } from './load-typescript.mjs';
const { PdfAnalysisLoading } = await import(moduleUrl(new URL('../packages/app/src/components/PdfAnalysisLoading.web.tsx', import.meta.url)));

test('PDF analysis displays provider state, elapsed time, last check and cancel action', () => {
  const now = Date.now();
  const render = (status, delayed = false, cancelling = false) => renderToStaticMarkup(React.createElement(PdfAnalysisLoading, {
    job: { phase: 'events', analysisStartedAt: now - 180000, progress: { status, startedAt: now - 180000, checkedAt: now } },
    delayed, cancelling, onCancel() {},
  }));
  assert.match(render('queued'), /분석 순서를 기다리고 있어요/);
  const active = render('in_progress');
  assert.match(active, /OpenAI가 PDF를 분석 중이에요/);
  assert.match(active, /score-pdf-loading-spinner/);
  assert.match(active, /경과 시간 3분/);
  assert.match(active, /마지막 상태 확인/);
  assert.match(active, /분석 취소/);
  assert.match(render('in_progress', true), /분석 상태를 확인하고 있어요/);
  assert.match(render('delayed'), /분석 상태를 확인하고 있어요/);
  assert.match(render('received'), /분석 결과를 확인하고 있어요/);
  assert.match(render('in_progress', false, true), /disabled=""/);
});
