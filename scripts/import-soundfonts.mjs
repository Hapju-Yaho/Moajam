// Rebuild the local, data-only FluidR3 assets. Never execute downloaded JavaScript.
/* global fetch, AbortSignal, console */
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const revision = '044fab8e1456bfafc5776e86dfd6bb8697149aef';
const source = `https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/${revision}`;
const catalog = await readFile(
  new URL('../packages/app/src/lib/soundfontCatalog.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(catalog, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { soundfontInstruments } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const directory = new URL('../apps/web/public/soundfonts/fluidr3/', import.meta.url);
await mkdir(directory, { recursive: true });
const manifest = { revision, source, license: 'CC-BY-3.0', instruments: {} };
async function download(path) {
  const response = await fetch(`${source}/${path}`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.text();
}
for (const { id } of soundfontInstruments) {
  const script = await download(`FluidR3_GM/${id}-mp3.js`);
  const assignment = `MIDI.Soundfont.${id} =`;
  const start = script.indexOf(assignment);
  if (start < 0) throw new Error(`Unexpected soundfont wrapper: ${id}`);
  const notes = JSON.parse(
    script.slice(script.indexOf('{', start), script.lastIndexOf('}') + 1).replace(/,\s*}$/, '}'),
  );
  if (
    Object.keys(notes).length < 12 ||
    Object.entries(notes).some(
      ([note, data]) =>
        !/^[A-G]b?-?\d$/.test(note) ||
        typeof data !== 'string' ||
        !data.startsWith('data:audio/mp3;base64,'),
    )
  )
    throw new Error(`Invalid soundfont: ${id}`);
  const json = JSON.stringify(notes);
  await writeFile(new URL(`${id}.json`, directory), json);
  manifest.instruments[id] = {
    notes: Object.keys(notes).length,
    bytes: Buffer.byteLength(json),
    sha256: createHash('sha256').update(json).digest('hex'),
  };
  console.log(
    `${id}: ${Object.keys(notes).length} notes, ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(1)} MB`,
  );
}
await writeFile(new URL('SOURCE-README.md', directory), await download('README.md'));
await writeFile(new URL('SOURCE-LICENSE.txt', directory), await download('LICENSE.txt'));
await writeFile(new URL('manifest.json', directory), JSON.stringify(manifest, null, 2) + '\n');
