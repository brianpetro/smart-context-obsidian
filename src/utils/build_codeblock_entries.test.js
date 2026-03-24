import test from 'ava';
import { build_codeblock_entries } from './build_codeblock_entries.js';

test('build_codeblock_entries keeps named context line without expanded items', (t) => {
  const entries = build_codeblock_entries({
    context_items: {
      'some name': {
        key: 'some name',
        named_context: true,
      },
    },
  });

  t.deepEqual(entries, ['ctx:: some name']);
});

test('build_codeblock_entries compresses folder items and preserves exclusions', (t) => {
  const entries = build_codeblock_entries({
    context_items: {
      'external:../repo/src/index.js': {
        key: 'external:../repo/src/index.js',
        folder: '../repo/src',
      },
      'external:../repo/src/lib/util.js': {
        key: 'external:../repo/src/lib/util.js',
        folder: '../repo/src',
      },
      'external:../repo/src/lib/ignore.js': {
        key: 'external:../repo/src/lib/ignore.js',
        exclude: true,
      },
    },
  });

  t.deepEqual(entries, [
    '../repo/src',
    '!../repo/src/lib/ignore.js',
  ]);
});
