import test from 'ava';
import { build_path_tree } from './build_context_items_tree_html.js';

test('should create nested structure', t => {
  const items = [
    { path: 'foo/bar.md' },
    { path: 'foo/baz.md' }
  ];
  const tree = build_path_tree(items);
  t.truthy(tree.children.foo);
  t.truthy(tree.children.foo.children['bar.md']);
  t.truthy(tree.children.foo.children['baz.md']);
});

test('should omit redundant child paths', t => {
  const items = [
    { path: 'foo' },
    { path: 'foo/bar.md' }
  ];
  const tree = build_path_tree(items);
  t.true(tree.children.foo.selected);
  t.deepEqual(Object.keys(tree.children.foo.children), []);
});

test('should split by block key separator, keeping the preceding block separator(s)', t => {
  const items = [
    { path: 'foo/bar.md##baz#{1}' },
  ];
  const tree = build_path_tree(items);
  // console.dir(tree, { depth: null });
  const top = tree.children['foo'];
  t.truthy(top);
  const next_1 = top.children['bar.md'];
  t.truthy(next_1);
  const next_2 = next_1.children['##baz'];
  t.truthy(next_2);
  const next_3 = next_2.children['#{1}'];
  t.truthy(next_3);
  t.is(next_3.children.length, 0);
});


test('should not split by forward slash contained in block key', t => {
  const items = [
    { path: 'foo/bar.md##baz / foobar#{1}' },
  ];
  const tree = build_path_tree(items);
  // console.dir(tree, { depth: null });
  const top = tree.children['foo'];
  t.truthy(top);
  const next_1 = top.children['bar.md'];
  t.truthy(next_1);
  const next_2 = next_1.children['##baz / foobar'];
  t.truthy(next_2);
  const next_3 = next_2.children['#{1}'];
  t.truthy(next_3);
  t.is(next_3.children.length, 0);
});

test('should strip preceding word characters followed by colon (e.g., "external:../")', t => {
  const items = [
    { path: 'external:../foo/bar.md' },
    { path: 'baz/boo.md' }
  ];
  const tree = build_path_tree(items);
  console.dir(tree, { depth: null });
  // Both should appear under 'foo'
  t.truthy(tree.children.baz);
  t.truthy(tree.children.foo.children['bar.md']);
  // Should not have a top-level 'external:' node
  t.falsy(tree.children['external:../foo']);
  t.falsy(tree.children['external:../']);
});