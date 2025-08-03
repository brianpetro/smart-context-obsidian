import test from 'ava';
import { remove_context_path } from './remove_context_path.js';

test('removes all descendants of a folder', t => {
  const items = {
    'foo/bar.md': {},
    'foo/bar.md#^a': {},
    'foo/baz.md': {},
  };
  const result = remove_context_path(items, 'foo');
  t.deepEqual(result, {});
});

test('removes file and block paths', t => {
  const items = {
    'foo/bar.md#^a': {},
    'foo/bar.md#^b': {},
    'foo/baz.md': {}
  };
  const result = remove_context_path(items, 'foo/bar.md');
  t.deepEqual(result, { 'foo/baz.md': {} });
});
