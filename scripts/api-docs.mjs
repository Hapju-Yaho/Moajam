import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import swaggerUi from 'swagger-ui-dist';
import { readSpec, specPath } from './api-docs-lib.mjs';

const port = Number(process.env.API_DOCS_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_DOCS_PORT must be an integer between 1 and 65535');
}
readSpec();
const assets = new Map([
  ['/swagger-ui.css', 'text/css; charset=utf-8'],
  ['/swagger-ui-bundle.js', 'text/javascript; charset=utf-8'],
]);
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moajam API 설계 · Swagger</title><link rel="stylesheet" href="/swagger-ui.css">
<style>body{margin:0;background:#fafafa}.notice{padding:18px 5%;background:#eef4ff;color:#173461;font:15px/1.6 system-ui}.notice a{color:inherit}</style>
</head><body><div class="notice"><strong>Moajam API · 개발 전 목표 설계</strong><br>
현재 구현과 다를 수 있습니다. API 실행은 제공하지 않습니다. DB 없이 요청·응답·권한을 검토하는 문서입니다.
<a href="/openapi.yaml">명세 내려받기</a></div><div id="swagger-ui"></div>
<script src="/swagger-ui-bundle.js"></script><script src="/init.js"></script></body></html>`;
const init = `SwaggerUIBundle({url:'/openapi.json',dom_id:'#swagger-ui',deepLinking:true,filter:true,
docExpansion:'none',defaultModelsExpandDepth:-1,displayOperationId:true,displayRequestDuration:false,
supportedSubmitMethods:[],validatorUrl:null,persistAuthorization:false,showExtensions:true});`;

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    let content;
    let type;
    if (path === '/' || path === '/docs') {
      content = html;
      type = 'text/html; charset=utf-8';
    } else if (path === '/init.js') {
      content = init;
      type = 'text/javascript; charset=utf-8';
    } else if (path === '/openapi.json') {
      content = JSON.stringify(readSpec());
      type = 'application/json; charset=utf-8';
    } else if (path === '/openapi.yaml') {
      content = await readFile(specPath);
      type = 'application/yaml; charset=utf-8';
    } else if (assets.has(path)) {
      content = await readFile(join(swaggerUi.getAbsoluteFSPath(), path.slice(1)));
      type = assets.get(path);
    } else {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': type });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    response
      .writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end('문서를 읽을 수 없습니다. 명세 문법과 서버 출력을 확인해주세요.');
  }
});
server.on('error', (error) => {
  process.stderr.write(`Swagger 문서 서버 실행 실패: ${error.message}\n`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(
    `Moajam 설계 Swagger: http://127.0.0.1:${port}\nDB 연결 없이 실행 중. 종료: Ctrl+C\n`,
  );
});
