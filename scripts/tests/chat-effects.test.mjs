import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Execute the actual chat scroll effects with the newer Promise-returning browser API.
// React accepts undefined or a cleanup function; returning a Promise crashes on cleanup.
const source = ts.createSourceFile('OmniPager.tsx', fs.readFileSync(new URL('../../src/components/social/OmniPager.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('scrollIntoView')) effects.push(node.arguments[0].getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
for (const [index, effect] of effects.entries()) {
  test(`${index === 0 ? 'direct' : 'group'} chat scroll effect does not return a browser Promise as cleanup`, () => {
    let calls = 0;
    const callback = vm.runInNewContext(`(${effect})`, { endRef: { current: { scrollIntoView() { calls++; return Promise.resolve(); } } } });
    const cleanup = callback();
    assert.equal(calls, 1);
    assert.equal(cleanup, undefined, 'Scroll effects must discard the browser return value');
    // A second update and unmount must also be safe.
    assert.doesNotThrow(() => { if (cleanup !== undefined) cleanup(); callback(); });
  });
}
test('both direct and group chat scroll effects are covered', () => assert.equal(effects.length, 2));
