import { readFileSync, existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import ts from 'typescript';
const cache = new Map();
export function moduleUrl(path) {
  if (cache.has(path.href)) return cache.get(path.href);
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const linked = outputText.replace(/from ['"](.+?)['"]/g, (_, relative) => {
    if (!relative.startsWith('.')) return `from '${import.meta.resolve(relative)}'`;
    const candidate = new URL(relative + '.ts', path);
    return `from '${moduleUrl(existsSync(candidate) ? candidate : new URL(relative + '.tsx', path))}'`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`;
  cache.set(path.href, url);
  return url;
}
