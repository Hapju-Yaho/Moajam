import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const jobSchema = { jobId: { type: 'string', format: 'uuid' } };
export const pdfTools = [
  {
    name: 'start_pdf_analysis',
    description:
      'PDF를 업로드하고 GPT 분석을 시작합니다. API 사용료가 발생합니다. 같은 파일의 완료 결과는 재사용합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'MOAJAM_PDF_DIRECTORY 안의 PDF 절대 경로' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_pdf_analysis_status',
    description: 'PDF 분석 작업 상태 조회',
    inputSchema: {
      type: 'object',
      properties: jobSchema,
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_pdf_analysis_result',
    description: '변환 악보 데이터, 검증 경고와 API 사용 토큰 조회',
    inputSchema: {
      type: 'object',
      properties: jobSchema,
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'reanalyze_pdf_section',
    description:
      '기존 결과의 특정 페이지·마디를 재분석합니다. 전체 PDF를 다시 전송하며 API 사용료가 발생합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        ...jobSchema,
        page: { type: 'integer', minimum: 1, maximum: 40 },
        measure: { type: 'integer', minimum: 1, maximum: 32000 },
      },
      required: ['jobId', 'page'],
      additionalProperties: false,
    },
  },
  {
    name: 'confirm_pdf_structure',
    description:
      '사용자가 PDF의 마디 경계를 확인·수정한 뒤 호출합니다. 결과 조회의 structure와 revision을 전달해 음표 분석을 시작하며 API 비용이 발생합니다. 자동 확인하지 마세요.',
    inputSchema: {
      type: 'object',
      properties: {
        ...jobSchema,
        revision: { type: 'integer', minimum: 1 },
        structure: { type: 'object', additionalProperties: true },
      },
      required: ['jobId', 'revision', 'structure'],
      additionalProperties: false,
    },
  },
];

export function createPdfMcpServer(call) {
  const server = new Server(
    { name: 'moajam-score-pdf', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: pdfTools }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      const tool = pdfTools.find((t) => t.name === params.name);
      if (!tool) throw new Error('Unknown tool');
      const args = params.arguments ?? {};
      const schema = tool.inputSchema;
      if (
        Object.keys(args).some((k) => !(k in schema.properties)) ||
        schema.required.some((k) => !(k in args))
      )
        throw new Error('Invalid tool arguments');
      if (params.name === 'start_pdf_analysis') {
        if (typeof args.path !== 'string' || !isAbsolute(args.path))
          throw new Error('PDF 절대 경로가 필요합니다.');
      } else {
        if (typeof args.jobId !== 'string' || !/^[a-f0-9-]{36}$/i.test(args.jobId))
          throw new Error('유효한 작업 ID가 필요합니다.');
        if (
          params.name === 'confirm_pdf_structure' &&
          (!Number.isInteger(args.revision) ||
            args.revision < 1 ||
            !args.structure ||
            typeof args.structure !== 'object' ||
            Array.isArray(args.structure))
        )
          throw new Error('확인할 구조와 최신 revision이 필요합니다.');
        if (
          params.name === 'reanalyze_pdf_section' &&
          (!Number.isInteger(args.page) ||
            args.page < 1 ||
            args.page > 40 ||
            (args.measure !== undefined &&
              (!Number.isInteger(args.measure) || args.measure < 1 || args.measure > 32000)))
        )
          throw new Error('페이지·마디 범위가 올바르지 않습니다.');
      }
      const result = await call(params.name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e) {
      return {
        isError: true,
        content: [{ type: 'text', text: e instanceof Error ? e.message : 'PDF request failed' }],
      };
    }
  });
  return server;
}

export function createPdfApiCaller({ apiUrl, token, directory }) {
  const base = new URL(apiUrl);
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error('Invalid MOAJAM_API_URL');
  return async (name, args) => {
    const headers = { Authorization: `Bearer ${token}` };
    let path,
      method = 'GET',
      body;
    if (name === 'start_pdf_analysis') {
      if (!directory) throw new Error('MOAJAM_PDF_DIRECTORY를 설정해주세요.');
      const root = await realpath(directory),
        file = await realpath(args.path);
      const rel = relative(root, file);
      if (
        rel === '..' ||
        rel.startsWith('..\\') ||
        rel.startsWith('../') ||
        isAbsolute(rel) ||
        !/\.pdf$/i.test(file)
      )
        throw new Error('허용된 PDF 폴더 안의 파일만 업로드할 수 있습니다.');
      const info = await stat(file);
      if (!info.isFile() || !info.size || info.size > 20 * 1024 * 1024)
        throw new Error('20MB 이하의 PDF가 필요합니다.');
      const data = new FormData();
      data.append(
        'file',
        new Blob([await readFile(file)], { type: 'application/pdf' }),
        basename(file),
      );
      path = '/score-pdf/jobs';
      method = 'POST';
      body = data;
    } else {
      path = `/score-pdf/jobs/${encodeURIComponent(args.jobId)}`;
      if (name === 'get_pdf_analysis_result') path += '/result';
      if (name === 'confirm_pdf_structure') {
        path += '/structure/confirm';
        method = 'POST';
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ structure: args.structure, revision: args.revision });
      }
      if (name === 'reanalyze_pdf_section') {
        path += '/reanalyze';
        method = 'POST';
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          page: args.page,
          ...(args.measure === undefined ? {} : { measure: args.measure }),
        });
      }
    }
    const response = await fetch(base.toString().replace(/\/$/, '') + path, {
      method,
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail ?? `API error ${response.status}`);
    if (name === 'start_pdf_analysis') {
      const started = await fetch(
        base.toString().replace(/\/$/, '') +
          `/score-pdf/jobs/${encodeURIComponent(result.id)}/analyze`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: '{}',
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
        },
      );
      const status = await started.json();
      if (!started.ok) throw new Error(status.detail ?? `API error ${started.status}`);
      return status;
    }
    return result;
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env.MOAJAM_ACCESS_TOKEN;
  if (!token)
    throw new Error(
      'MOAJAM_ACCESS_TOKEN이 필요합니다. OpenAI API 키가 아닌 모아잼 로그인 토큰입니다.',
    );
  const server = createPdfMcpServer(
    createPdfApiCaller({
      apiUrl: process.env.MOAJAM_API_URL ?? 'http://localhost:3000/v1',
      token,
      directory: process.env.MOAJAM_PDF_DIRECTORY,
    }),
  );
  await server.connect(new StdioServerTransport());
}
