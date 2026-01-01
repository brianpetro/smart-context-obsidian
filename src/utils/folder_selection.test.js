import test from 'ava';
import {
  normalize_folder_prefix,
  get_selected_folder_paths,
  expand_folders_to_item_keys,
} from './folder_selection.js';

const create_sources = (keys) => ({
  filter({ key_starts_with }) {
    return keys
      .filter((key) => key.startsWith(key_starts_with))
      .map((key) => ({ key }));
  },
});

test('normalize_folder_prefix enforces trailing slashes and trims input', (t) => {
  t.is(normalize_folder_prefix('folder'), 'folder/');
  t.is(normalize_folder_prefix('folder/'), 'folder/');
  t.is(normalize_folder_prefix('  nested/folder  '), 'nested/folder/');
  t.is(normalize_folder_prefix(null), '');
});

test('get_selected_folder_paths collects unique folder entries', (t) => {
  const paths = get_selected_folder_paths([
    { path: 'folder', children: [] },
    { path: 'folder', children: [] },
    { path: 'file.md' },
    { path: 'nested/space', children: [1] },
    { path: null, children: [] },
  ]);

  t.deepEqual(paths, ['folder', 'nested/space']);
});

test('expand_folders_to_item_keys matches only normalized folder prefixes', (t) => {
  const sources = create_sources([
    'folder/note-a.md',
    'folder/nested/note-b.md',
    'folder-archive/note-c.md',
    'folderish/note-d.md',
    'folder/note-a.md',
  ]);

  const keys = expand_folders_to_item_keys(['folder', 'folder-archive'], sources);

  t.deepEqual(keys, ['folder/note-a.md', 'folder/nested/note-b.md', 'folder-archive/note-c.md']);
});

test('expand_folders_to_item_keys handles invalid inputs gracefully', (t) => {
  t.deepEqual(expand_folders_to_item_keys(null, null), []);
  t.deepEqual(expand_folders_to_item_keys([], {}), []);
  t.deepEqual(expand_folders_to_item_keys(['folder'], { filter: () => null }), []);
});
