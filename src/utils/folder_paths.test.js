import test from 'ava';

import { get_selected_folder_paths, normalize_folder_prefix } from './folder_paths.js';

test('normalize_folder_prefix ensures a trailing slash for folder matching', (t) => {
  t.is(normalize_folder_prefix('folder'), 'folder/');
  t.is(normalize_folder_prefix('folder/'), 'folder/');
  t.is(normalize_folder_prefix('  nested/folder  '), 'nested/folder/');
});

test('normalize_folder_prefix returns empty string for invalid inputs', (t) => {
  t.is(normalize_folder_prefix(''), '');
  t.is(normalize_folder_prefix(null), '');
  t.is(normalize_folder_prefix(undefined), '');
});

test('get_selected_folder_paths collects unique folder paths in selection order', (t) => {
  const folders = get_selected_folder_paths([
    { path: 'Projects', children: [] },
    { path: 'Projects', children: [] },
    { path: 'Inbox', children: [] },
    { path: 'File.md' },
  ]);

  t.deepEqual(folders, ['Projects', 'Inbox']);
});

test('get_selected_folder_paths ignores invalid entries', (t) => {
  t.deepEqual(get_selected_folder_paths(null), []);
  t.deepEqual(get_selected_folder_paths([{ children: [] }]), []);
  t.deepEqual(get_selected_folder_paths([{ path: null, children: [] }]), []);
});
