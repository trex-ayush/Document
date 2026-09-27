import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Catches a component used in JSX but never imported or defined (e.g. `<Tooltip>` without
 * `import Tooltip`). The build doesn't catch that: the page only crashes when that part renders,
 * showing "Something went wrong". A name counts as defined when it appears anywhere in the file
 * other than as a JSX tag (an import, a function, a `const`, or `{ icon: Icon }`).
 */
const SRC = join(__dirname, '..', '..', '..');

function jsxFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === '__tests__' ? [] : jsxFiles(path);
    return name.endsWith('.jsx') ? [path] : [];
  });
}

function undefinedTags(source) {
  // Comments can mention <Components> in prose; drop them first.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const tags = new Set([...code.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]));
  return [...tags].filter((name) => {
    const all = code.match(new RegExp(`\\b${name}\\b`, 'g')) || [];
    const asTag = code.match(new RegExp(`</?${name}\\b`, 'g')) || [];
    return all.length === asTag.length;
  });
}

describe('JSX component names', () => {
  it('every component used in JSX is imported or defined in its file', () => {
    const problems = jsxFiles(SRC)
      .map((file) => ({ file: relative(SRC, file), names: undefinedTags(readFileSync(file, 'utf8')) }))
      .filter((p) => p.names.length);
    expect(problems).toEqual([]);
  });

  it('flags a missing import', () => {
    expect(undefinedTags('export default function A() { return <Tooltip content="x"><b /></Tooltip>; }')).toEqual(['Tooltip']);
    expect(undefinedTags("import Tooltip from './Tooltip.jsx';\nconst A = () => <Tooltip />;")).toEqual([]);
    expect(undefinedTags('function Row({ icon: Icon }) { return <Icon />; }')).toEqual([]);
  });
});
