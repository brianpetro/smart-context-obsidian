import test from 'ava';
import { build_context_item_li } from './build_context_item_li.js';

test('build_context_item_li adds controls for selected paths', t => {
  const selected_paths = new Set(['foo/bar.md']);
  const html = build_context_item_li({ path: 'foo/bar.md', name: 'bar.md', is_file: true }, selected_paths);
  t.true(html.includes('sc-tree-remove'));
  t.true(html.includes('sc-tree-label'));
});
