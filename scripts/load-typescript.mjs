import { readFileSync, existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import ts from 'typescript';
const cache = new Map();
const {
  compilerOptions: { paths },
} = JSON.parse(readFileSync(new URL('../tsconfig.base.json', import.meta.url), 'utf8'));
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
    const alias = Object.keys(paths).find((name) => relative.startsWith(name.slice(0, -1)));
    if (alias) {
      const base = new URL('../' + paths[alias][0].replace(/\*$/, ''), import.meta.url);
      const specifier = relative.slice(alias.length - 1);
      const candidate = new URL(specifier + '.ts', base);
      return `from '${moduleUrl(existsSync(candidate) ? candidate : new URL(specifier + '.tsx', base))}'`;
    }
    if (!relative.startsWith('.')) return `from '${import.meta.resolve(relative)}'`;
    const candidate = new URL(relative + '.ts', path);
    return `from '${moduleUrl(existsSync(candidate) ? candidate : new URL(relative + '.tsx', path))}'`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`;
  cache.set(path.href, url);
  return url;
}
