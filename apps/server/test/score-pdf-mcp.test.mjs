import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createPdfMcpServer } from '../scripts/score-pdf-mcp.mjs';

test('MCP initialization, five tools including explicit structure confirmation, dispatch and invalid arguments', async () => {
  const calls = [];
  const server = createPdfMcpServer(async (name, args) => {
    calls.push({ name, args });
    return { status: 'prepared', analysisEnabled: false };
  });
  const client = new Client({ name: 'test', version: '1.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const list = await client.listTools();
    assert.equal(list.tools.length, 5);
    const jobId = '12345678-1234-1234-1234-123456789012';
    for (const name of [
      'get_pdf_analysis_status',
      'get_pdf_analysis_result',
      'reanalyze_pdf_section',
    ]) {
      const response = await client.callTool({
        name,
        arguments: { jobId, ...(name === 'reanalyze_pdf_section' ? { page: 1 } : {}) },
      });
      assert.equal(response.isError, undefined);
      assert.equal(JSON.parse(response.content[0].text).analysisEnabled, false);
    }
    const invalid = await client.callTool({
      name: 'reanalyze_pdf_section',
      arguments: { jobId, page: 0 },
    });
    assert.equal(invalid.isError, true);
    assert.equal(calls.length, 3);
    const confirmed = await client.callTool({
      name: 'confirm_pdf_structure',
      arguments: { jobId, revision: 1, structure: { parts: [] } },
    });
    assert.equal(confirmed.isError, undefined);
    const invalidConfirm = await client.callTool({
      name: 'confirm_pdf_structure',
      arguments: { jobId, revision: 0, structure: {} },
    });
    assert.equal(invalidConfirm.isError, true);
    const unknown = await client.callTool({ name: 'unknown', arguments: {} });
    assert.equal(unknown.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
