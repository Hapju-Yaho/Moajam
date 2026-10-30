import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  Optional,
  type OnModuleDestroy,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import type { AnalysisProgress } from './background-response.js';
import {
  applyTabProfile,
  type TabScoreType,
  prepareRecognitionRequest,
  prepareStructureRequest,
  matchesRecognitionTarget,
  type RecognitionTarget,
} from './recognition-request.js';
import {
  markForcedEstimate,
  normalizeRecognitionPartNames,
  readStructure,
  reviewRecognition,
  recognizedDrumHits,
  type ScoreStructure,
  type ReviewIssue,
} from './recognition-validation.js';
import {
  PdfRecognitionClient,
  RecognitionError,
  type RecognitionUsage,
} from './pdf-recognition.client.js';
import { convertRecognition } from './convert-recognition.js';
import { renderMeasureCrops, type MeasureCropInfo } from './measure-crops.js';
import { alignStructureToPdfLines } from './structure-line-alignment.js';
import {
  recognitionDiagnostics,
  scoreConversionDiagnostics,
  type RecognitionDiagnostics,
} from './recognition-diagnostics.js';

export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const PDF_MAX_PAGES = 40;
const TTL = 60 * 60 * 1000;
type Job = {
  id: string;
  owner: string;
  scoreType: TabScoreType;
  name: string;
  size: number;
  pages: number;
  hash: string;
  createdAt: number;
  pdf: Buffer;
  state: 'prepared' | 'analyzing' | 'structure_review' | 'completed' | 'failed';
  revision?: number;
  converted?: ReturnType<typeof convertRecognition>;
  usage?: RecognitionUsage;
  model?: string;
  error?: { code: string; message: string };
  abort?: AbortController;
  diagnostics?: RecognitionDiagnostics;
  structureDiagnostic?: RecognitionDiagnostics;
  structure?: ScoreStructure;
  draft?: unknown;
  forcedMeasures?: { part: string; page: number; measure: number }[];
  issues?: ReviewIssue[];
  phase?: 'structure' | 'events' | 'validation';
  progress?: AnalysisProgress;
  analysisStartedAt?: number;
};

@Injectable()
export class ScorePdfService implements OnModuleDestroy {
  constructor(@Optional() private readonly recognition?: PdfRecognitionClient) {}
  // Bounded preparation cache, not a conversion queue or persistent project storage.
  private readonly jobs = new Map<string, Job>();
  private readonly cleanup = setInterval(() => this.prune(), 60000).unref();
  onModuleDestroy() {
    clearInterval(this.cleanup);
    for (const job of this.jobs.values()) job.abort?.abort();
    this.jobs.clear();
  }
  private prune() {
    for (const [id, job] of this.jobs)
      if (Date.now() - job.createdAt >= TTL) {
        job.abort?.abort();
        this.jobs.delete(id);
      }
  }
  async start(owner: string, name: string, pdf: Buffer, scoreType: TabScoreType = 'guitar-tab') {
    this.prune();
    if (!['guitar-tab', 'bass-tab', 'vocal-staff', 'keyboard', 'drums'].includes(scoreType))
      throw new BadRequestException('Unsupported score type');
    if (
      !name.toLowerCase().endsWith('.pdf') ||
      !pdf.length ||
      pdf.length > PDF_MAX_BYTES ||
      !pdf.subarray(0, 1024).includes(Buffer.from('%PDF-'))
    )
      throw new BadRequestException('20MB 이하의 PDF 파일을 선택해주세요.');
    const hash = createHash('sha256').update(pdf).digest('hex');
    const existing = [...this.jobs.values()].find(
      (j) => j.owner === owner && j.hash === hash && j.scoreType === scoreType,
    );
    if (existing) return this.status(owner, existing.id);
    const all = [...this.jobs.values()];
    if (
      all.filter((j) => j.owner === owner).length >= 3 ||
      all.reduce((n, j) => n + j.size, 0) + pdf.length > 100 * 1024 * 1024
    )
      throw new HttpException(
        '준비한 PDF가 많습니다. 기존 작업을 제거한 뒤 다시 시도해주세요.',
        429,
      );
    let document: PDFDocument;
    try {
      document = await PDFDocument.load(pdf, { updateMetadata: false, throwOnInvalidObject: true });
    } catch {
      throw new BadRequestException(
        'PDF가 손상되었거나 암호화되어 있습니다. 암호를 해제한 PDF를 선택해주세요.',
      );
    }
    const pages = document.getPageCount();
    if (!pages || pages > PDF_MAX_PAGES)
      throw new BadRequestException('1~40페이지의 PDF를 선택해주세요.');
    // Recheck after asynchronous parsing to keep concurrent requests within cache limits.
    this.prune();
    const current = [...this.jobs.values()];
    const duplicate = current.find(
      (j) => j.owner === owner && j.hash === hash && j.scoreType === scoreType,
    );
    if (duplicate) return this.status(owner, duplicate.id);
    if (
      current.filter((j) => j.owner === owner).length >= 3 ||
      current.reduce((n, j) => n + j.size, 0) + pdf.length > 100 * 1024 * 1024
    )
      throw new HttpException('준비 작업 한도를 초과했습니다.', 429);
    const job: Job = {
      id: randomUUID(),
      owner,
      scoreType,
      name: Array.from(name, (c) => (c.charCodeAt(0) < 32 || c === '/' || c === '\\' ? '_' : c))
        .join('')
        .slice(0, 255),
      size: pdf.length,
      pages,
      hash,
      createdAt: Date.now(),
      pdf,
      state: 'prepared',
    };
    // Exercise the complete preparation boundary; never send or log this payload.
    applyTabProfile(prepareRecognitionRequest(job.name, pdf), job.scoreType);
    this.jobs.set(job.id, job);
    return this.status(owner, job.id);
  }
  private get(owner: string, id: string) {
    this.prune();
    const job = this.jobs.get(id);
    if (!job || job.owner !== owner)
      throw new NotFoundException('PDF 준비 작업이 없거나 만료되었습니다. 다시 업로드해주세요.');
    return job;
  }
  status(owner: string, id: string) {
    const j = this.get(owner, id);
    return {
      id: j.id,
      name: j.name,
      size: j.size,
      pages: j.pages,
      scoreType: j.scoreType,
      status: j.state,
      phase: j.phase,
      progress: j.progress,
      analysisStartedAt: j.analysisStartedAt,
      revision: j.revision ?? 0,
      canReanalyze: !!j.structure && !!j.draft,
      analysisEnabled: this.recognition?.enabled ?? false,
      expiresAt: new Date(j.createdAt + TTL).toISOString(),
      message:
        j.state === 'completed'
          ? j.issues?.some((i) => ['DRUM_HIT_OMISSION', 'DRUM_COVERAGE_MISSING'].includes(i.code))
            ? '악보 추출 완료 · 드럼 타격 누락 가능성이 있어요. 성부별 검토 항목을 확인해주세요.'
            : j.issues?.some((i) => i.blocking === false)
              ? '악보 추출 완료 · 일부 박자를 추정했어요. 원본과 비교해 다듬어주세요.'
              : '악보 추출을 완료했어요.'
          : j.state === 'structure_review'
            ? 'PDF 위의 마디 경계를 확인·수정한 뒤 음표 분석을 시작해주세요.'
            : j.state === 'analyzing'
              ? j.phase === 'structure'
                ? '1/2 · 파트와 마디 구조를 분석하고 있어요…'
                : j.phase === 'events'
                  ? '2/2 · 마디별 음표를 분석하고 있어요…'
                  : '음표와 박자를 검증하고 있어요…'
              : j.state === 'failed'
                ? j.error?.message
                : 'PDF 준비 완료 · 악보 추출을 시작할 수 있어요.',
      error: j.error,
      usage: j.usage,
      model: j.model,
      request: {
        encoding: 'base64',
        scope: 'entire_pdf',
        output: 'score_recognition_json_v2',
        stages: 2,
      },
    };
  }
  list(owner: string) {
    this.prune();
    return [...this.jobs.values()]
      .filter((job) => job.owner === owner)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((job) => this.status(owner, job.id));
  }
  source(owner: string, id: string) {
    const job = this.get(owner, id);
    return { name: job.name, base64: job.pdf.toString('base64') };
  }
  result(owner: string, id: string) {
    const job = this.get(owner, id);
    return {
      ...this.status(owner, id),
      result: job.converted
        ? {
            score: job.converted.score,
            measures: job.converted.measures,
            sourceStartMeasure: job.converted.sourceStartMeasure,
          }
        : null,
      warnings: [...(job.structure?.warnings ?? []), ...(job.converted?.warnings ?? [])],
      diagnostics: job.diagnostics,
      structure: job.structure,
      recognizedHits: job.structure ? recognizedDrumHits(job.draft, job.structure) : [],
      issues: job.issues ?? [],
    };
  }
  // Internal provider boundary only. Do not expose Base64 through REST/MCP responses.
  prepareRequest(owner: string, id: string) {
    const j = this.get(owner, id);
    return applyTabProfile(prepareRecognitionRequest(j.name, j.pdf), j.scoreType);
  }
  reanalyze(owner: string, id: string, page: number, measure?: number) {
    const job = this.get(owner, id);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > job.pages ||
      (measure !== undefined && (!Number.isInteger(measure) || measure < 1 || measure > 32000))
    )
      throw new BadRequestException('유효한 페이지와 마디 번호를 입력해주세요.');
    if (!job.structure || !job.draft)
      return { ...this.status(owner, id), accepted: false, code: 'NO_RESULT' };
    if (
      !job.structure.parts.some((p) =>
        p.measures.some((m) => m.page === page && (measure === undefined || m.number === measure)),
      )
    )
      throw new BadRequestException('이 페이지·마디에 재분석할 결과가 없습니다.');
    this.begin(owner, id, true, { page, measure });
    return { ...this.status(owner, id), accepted: true };
  }
  analyze(owner: string, id: string, retry = false) {
    this.begin(owner, id, retry);
    return this.status(owner, id);
  }
  reanalyzeBatch(
    owner: string,
    id: string,
    measures: { part: string; page: number; measure: number }[],
    forceInference = false,
  ) {
    const job = this.get(owner, id);
    if (
      !Array.isArray(measures) ||
      !measures.length ||
      measures.length > 128 ||
      measures.some(
        (m) =>
          !m ||
          typeof m.part !== 'string' ||
          m.part.length > 40 ||
          !Number.isInteger(m.page) ||
          m.page < 1 ||
          m.page > job.pages ||
          !Number.isInteger(m.measure) ||
          m.measure < 1 ||
          m.measure > 32000,
      )
    )
      throw new BadRequestException('재분석할 파트·페이지·마디를 1~128개 선택해주세요.');
    if (!job.structure || !job.draft)
      throw new BadRequestException('재분석할 음표 결과가 없습니다.');
    if (
      measures.some(
        (m) =>
          !job.structure!.parts.some(
            (p) =>
              p.id === m.part &&
              p.measures.some((b) => b.page === m.page && b.number === m.measure),
          ),
      )
    )
      throw new BadRequestException('구조에 없는 파트·마디가 포함됐어요.');
    const unique = measures.filter(
      (m, i) =>
        measures.findIndex(
          (n) => n.part === m.part && n.page === m.page && n.measure === m.measure,
        ) === i,
    );
    this.begin(owner, id, true, { measures: unique }, false, forceInference);
    return { ...this.status(owner, id), accepted: true };
  }
  confirmStructure(owner: string, id: string, structure: unknown, revision: number) {
    const job = this.get(owner, id);
    if (job.state !== 'structure_review' || revision !== job.revision)
      throw new BadRequestException('구조 결과가 변경됐어요. 최신 결과를 다시 확인해주세요.');
    let checked: ScoreStructure;
    try {
      checked = readStructure(structure, job.pages);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : '마디 경계를 확인해주세요.');
    }
    job.structure = {
      ...checked,
      scoreContext: job.structure?.scoreContext ?? checked.scoreContext,
    };
    this.begin(owner, id, true, undefined, true);
    return this.status(owner, id);
  }
  private begin(
    owner: string,
    id: string,
    retry: boolean,
    target?: RecognitionTarget,
    eventsOnly = false,
    forceInference = false,
  ) {
    const job = this.get(owner, id);
    if (
      job.state === 'analyzing' ||
      (job.state === 'structure_review' && !retry && !eventsOnly) ||
      (job.state === 'completed' && !target) ||
      (job.state === 'failed' && !retry)
    )
      return;
    if (!this.recognition?.enabled)
      throw new BadRequestException('서버에 OPENAI_API_KEY를 설정한 뒤 재시작해주세요.');
    if (
      [...this.jobs.values()].filter((j) => j.state === 'analyzing').length >= 2 ||
      [...this.jobs.values()].some((j) => j.owner === owner && j.state === 'analyzing')
    )
      throw new HttpException('다른 악보를 분석 중입니다. 완료 후 다시 시도해주세요.', 429);
    job.state = 'analyzing';
    job.analysisStartedAt = Date.now();
    job.progress = { status: 'starting', startedAt: job.analysisStartedAt };
    job.error = undefined;
    job.diagnostics = undefined;
    job.issues = undefined;
    job.createdAt = Date.now();
    const controller = new AbortController();
    job.abort = controller;
    void this.run(job, controller, target, eventsOnly, forceInference);
  }
  private async run(
    job: Job,
    controller: AbortController,
    target?: RecognitionTarget,
    eventsOnly = false,
    forceInference = false,
  ) {
    const timer = setTimeout(
      () => controller.abort(new Error('ANALYSIS_TIMEOUT')),
      1800000,
    ).unref();
    const onProgress = (progress: AnalysisProgress) => {
      job.progress = progress;
    };
    let usage: RecognitionUsage | undefined;
    let diagnostic: RecognitionDiagnostics | undefined;
    let cropInfo: MeasureCropInfo[] | undefined;
    const stages: RecognitionDiagnostics[] = [];
    if (eventsOnly && job.structureDiagnostic) stages.push(job.structureDiagnostic);
    const addUsage = (next?: RecognitionUsage) => {
      if (next)
        usage = {
          inputTokens: (usage?.inputTokens ?? 0) + next.inputTokens,
          outputTokens: (usage?.outputTokens ?? 0) + next.outputTokens,
          totalTokens: (usage?.totalTokens ?? 0) + next.totalTokens,
        };
    };
    try {
      if (!target && !eventsOnly) {
        job.phase = 'structure';
        job.structure = undefined;
        job.structureDiagnostic = undefined;
        job.draft = undefined;
        job.forcedMeasures = undefined;
        const structural = await this.recognition!.recognize(
          applyTabProfile(prepareStructureRequest(job.name, job.pdf), job.scoreType),
          controller.signal,
          onProgress,
        );
        addUsage(structural.usage);
        job.model = structural.model;
        diagnostic =
          structural.diagnostics ??
          recognitionDiagnostics(
            structural.data,
            '',
            { phase: 'response', model: structural.model, ...structural.usage },
            undefined,
            true,
          );
        stages.push(diagnostic);
        job.structureDiagnostic = diagnostic;
        job.structure = readStructure(
          normalizeRecognitionPartNames(structural.data, job.scoreType),
          job.pages,
          false,
        );
        const alignment = await alignStructureToPdfLines(job.pdf, job.structure, controller.signal);
        job.structure = alignment.structure;
        diagnostic = { ...diagnostic, boundaryAlignment: alignment.corrections };
        stages[stages.length - 1] = diagnostic;
        job.structureDiagnostic = diagnostic;
        job.revision = (job.revision ?? 0) + 1;
        try {
          readStructure(job.structure, job.pages);
        } catch (e) {
          job.issues = [
            {
              part: '',
              page: 1,
              measure: 1,
              code: 'STRUCTURE_BOUNDS',
              message: e instanceof Error ? e.message : '경계 확인이 필요합니다.',
            },
          ];
        }
        job.state = 'structure_review';
        job.diagnostics = { ...diagnostic, outcome: 'review', stages };
        return;
      }
      job.phase = 'events';
      const fixed = target
        ? {
            ...job.structure!,
            parts: job
              .structure!.parts.map((p) => ({
                ...p,
                measures: p.measures.filter((m) => matchesRecognitionTarget(target, p.id, m)),
              }))
              .filter((p) => p.measures.length),
          }
        : job.structure!;
      const crops = target ? await renderMeasureCrops(job.pdf, fixed, controller.signal) : [];
      cropInfo = crops.map((c) => ({
        part: c.part,
        page: c.page,
        measure: c.measure,
        bounds: c.bounds,
        width: c.width,
        height: c.height,
        ...(c.measures ? { measures: c.measures } : {}),
      }));
      const reply = await this.recognition!.recognize(
        applyTabProfile(
          prepareRecognitionRequest(job.name, job.pdf, target, fixed, crops, forceInference),
          job.scoreType,
          { structure: fixed, target, forceInference },
        ),
        controller.signal,
        onProgress,
      );
      addUsage(reply.usage);
      job.model = reply.model;
      diagnostic = {
        ...(reply.diagnostics ??
          recognitionDiagnostics(
            reply.data,
            '',
            {
              phase: 'conversion',
              model: reply.model,
              ...reply.usage,
              jsonParsed: true,
            },
            undefined,
            true,
          )),
        phase: 'conversion',
        measureCrops: cropInfo,
      };
      stages.push(diagnostic);
      job.phase = 'validation';
      const named = normalizeRecognitionPartNames(reply.data, job.scoreType, job.structure);
      const candidate = forceInference ? markForcedEstimate(named) : named;
      const selected = fixed.parts.flatMap((p) =>
        p.measures.map((m) => ({ part: p.id, page: m.page, measure: m.number })),
      );
      const forcedMeasures = [
        ...(job.forcedMeasures ?? []).filter(
          (t) =>
            !selected.some(
              (m) => m.part === t.part && m.page === t.page && m.measure === t.measure,
            ),
        ),
        ...(forceInference ? selected : []),
      ];
      let raw: unknown = candidate;
      if (target) {
        // Failed drafts may not pass the converter yet. Replace only the exact
        // fixed targets after checking the patch structure, retaining other bars.
        const patchIssues = reviewRecognition(
          candidate,
          fixed,
          forceInference ? selected : [],
          job.scoreType === 'drums',
        );
        if (
          patchIssues.some((i) =>
            [
              'STRUCTURE_MISMATCH',
              'PART_IDENTITY_MISMATCH',
              'EXTRA_MEASURE',
              'INVALID_RESULT',
            ].includes(i.code),
          )
        ) {
          job.issues = patchIssues;
          throw new RecognitionError('SCORE_REVIEW', patchIssues[0].message);
        }
        const patch = candidate as { parts: { id: string; measures: unknown[] }[] };
        const draft = job.draft as {
          parts: { id: string; measures: { number: number; page: number }[] }[];
          warnings?: { part: string; measure: number }[];
        };
        raw = {
          ...draft,
          warnings: [
            ...(draft.warnings ?? []).filter(
              (w) =>
                !fixed.parts.some(
                  (p) => p.id === w.part && p.measures.some((m) => m.number === w.measure),
                ),
            ),
            ...((candidate as { warnings?: unknown[] }).warnings ?? []),
          ],
          parts: job.structure!.parts.map((p) => ({
            ...p,
            measures: [
              ...(draft.parts.find((n) => n.id === p.id)?.measures ?? []).filter(
                (m) =>
                  !fixed.parts
                    .find((n) => n.id === p.id)
                    ?.measures.some((n) => n.number === m.number),
              ),
              ...(patch.parts.find((n) => n.id === p.id)?.measures ?? []),
            ].sort((a, b) => (a as { number: number }).number - (b as { number: number }).number),
          })),
        };
      }
      job.draft = raw && Array.isArray((raw as { parts?: unknown }).parts) ? raw : undefined;
      job.forcedMeasures = forcedMeasures;
      job.issues = reviewRecognition(
        raw,
        job.structure!,
        forcedMeasures,
        job.scoreType === 'drums',
      );
      const blockingIssues = job.issues.filter((i) => i.blocking !== false);
      if (blockingIssues.length)
        throw new RecognitionError(
          'SCORE_REVIEW',
          `${blockingIssues[0].measure}마디 · ${blockingIssues[0].message}`,
        );
      const converted = convertRecognition(raw, job.pages, job.name.replace(/\.pdf$/i, ''));
      for (const issue of job.issues.filter((i) => i.blocking === false)) {
        const part = job.structure!.parts.find((p) => p.id === issue.part)?.name ?? issue.part;
        const code =
          issue.code.startsWith('DRUM_') ||
          ['FORCED_INFERENCE', 'INCOMPLETE_BAR'].includes(issue.code)
            ? issue.code
            : issue.kind === 'tie'
              ? 'TIE_OMITTED'
              : issue.kind === 'string'
                ? 'NOTE_POSITION_ESTIMATED'
                : 'RHYTHM_ESTIMATED';
        if (
          !converted.warnings.some(
            (w) => w.part === part && w.measure === issue.measure && w.code === code,
          )
        )
          converted.warnings.push({ part, measure: issue.measure, code });
      }
      if (controller.signal.aborted) throw new RecognitionError('CANCELED', '분석이 취소됐어요.');
      job.converted = converted;
      job.diagnostics = {
        ...diagnostic,
        outcome: 'completed',
        conversion: scoreConversionDiagnostics(converted.score, converted.sourceStartMeasure),
        conversionWarnings: converted.warnings,
        stages,
      };
      job.state = 'completed';
    } catch (e) {
      job.state = 'failed';
      job.error = {
        code:
          controller.signal.reason?.message === 'ANALYSIS_TIMEOUT'
            ? 'ANALYSIS_TIMEOUT'
            : e instanceof RecognitionError
              ? e.code
              : 'CONVERSION_FAILED',
        message:
          controller.signal.reason?.message === 'ANALYSIS_TIMEOUT'
            ? '분석 대기 시간이 30분을 초과했어요. 페이지를 나누어 다시 시도해주세요.'
            : e instanceof RecognitionError
              ? e.message
              : '악보를 변환하지 못했어요. PDF를 확인해주세요.',
      };
      addUsage(e instanceof RecognitionError ? e.usage : undefined);
      job.diagnostics = (e instanceof RecognitionError ? e.diagnostics : undefined) ?? diagnostic;
      if (job.diagnostics) {
        job.diagnostics = {
          ...job.diagnostics,
          outcome: 'failed',
          stages,
          issues: job.issues,
          measureCrops: cropInfo,
        };
        delete job.diagnostics.outputJson;
      }
      // A failed targeted reanalysis retains the previous usable score.
    } finally {
      clearTimeout(timer);
      job.abort = undefined;
      job.createdAt = Date.now();
      if (usage)
        job.usage = {
          inputTokens: (job.usage?.inputTokens ?? 0) + usage.inputTokens,
          outputTokens: (job.usage?.outputTokens ?? 0) + usage.outputTokens,
          totalTokens: (job.usage?.totalTokens ?? 0) + usage.totalTokens,
        };
    }
  }
  remove(owner: string, id: string) {
    this.get(owner, id).abort?.abort();
    this.jobs.delete(id);
    return { ok: true };
  }
  clearInactive(owner: string, keepId?: string) {
    this.prune();
    let removed = 0;
    for (const [id, job] of this.jobs) {
      if (job.owner !== owner || id === keepId || job.state === 'analyzing') continue;
      this.jobs.delete(id);
      removed++;
    }
    return { removed };
  }
}
