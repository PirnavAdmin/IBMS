import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import postcss from 'postcss';

const baseline = JSON.parse(readFileSync(new URL('./css-cascade-baseline.json', import.meta.url)));
for (const { file, selectors, canonicalHash, removed } of baseline) {
  test(`CSS cascade preserved, including responsive/print/theme rules: ${file}`, () => {
    const tree = postcss.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
    const last = new Map();
    tree.walkRules(rule => {
      if (rule.parent.type !== 'root' || !selectors[rule.selector]) return;
      rule.walkDecls(decl => {
        if (!selectors[rule.selector].includes(decl.prop)) return;
        const key = [rule.selector, decl.prop, Boolean(decl.important)].join('|');
        assert.equal(last.has(key), false, `Redundant declaration returned: ${key}`);
        last.set(key, decl);
      });
    });
    tree.walkRules(rule => { if (!rule.nodes.some(node => node.type !== 'comment')) rule.remove(); });
    const walk = node => node.type === 'comment' ? null : node.type === 'decl'
      ? [node.prop, node.value, Boolean(node.important)]
      : [node.type, node.selector || node.name || '', node.params || '', node.nodes?.map(walk).filter(Boolean)];
    assert.equal(createHash('sha256').update(JSON.stringify(walk(tree))).digest('hex'), canonicalHash);
    assert.ok(removed.length > 0);
  });
}
