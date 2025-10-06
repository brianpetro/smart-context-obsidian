import test from 'ava';
import { build_folder_tree_for_path } from './build_folder_tree_for_path.js';

test('build_folder_tree_for_path returns entire tree when folder not specified', (t) => {
  const tree = build_folder_tree_for_path('', [
    'area/note.md',
    'area/sub/nested.md',
    'other/one.md',
  ], [
    'area/',
    'area/sub/',
    'other/',
  ]);

  t.is(
    tree,
    [
      '├── area/',
      '│   ├── sub/',
      '│   │   └── nested.md',
      '│   └── note.md',
      '└── other/',
      '    └── one.md',
    ].join('\n'),
  );
});

test('build_folder_tree_for_path scopes to requested folder', (t) => {
  const tree = build_folder_tree_for_path('area', [
    'area/note.md',
    'area/sub/nested.md',
    'other/skip.md',
  ], [
    'area/',
    'area/sub/',
    'other/',
  ]);

  t.is(
    tree,
    [
      '└── area/',
      '    ├── sub/',
      '    │   └── nested.md',
      '    └── note.md',
    ].join('\n'),
  );
});

test('build_folder_tree_for_path keeps folder label when folder exists without files', (t) => {
  const tree = build_folder_tree_for_path('missing', [
    'area/note.md',
  ], [
    'area/',
    'missing/',
  ]);

  t.is(tree, '└── missing/');
});
