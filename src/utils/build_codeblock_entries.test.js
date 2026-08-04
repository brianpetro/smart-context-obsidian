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

test('build_codeblock_entries serializes durable exclusions after inclusions', (t) => {
  const entries = build_codeblock_entries({
    context_items: {
      'public.md': {
        key: 'public.md',
      },
      Shared: {
        key: 'Shared',
        named_context: true,
      },
    },
    exclusions: {
      'private.md': {
        key: 'private.md',
        exclude: true,
      },
    },
  });

  t.deepEqual(entries, [
    'ctx:: Shared',
    'public.md',
    '!private.md',
  ]);
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
    },
    exclusions: {
      '*.test.js': {
        key: '*.test.js',
        exclude: true,
      },
    },
  });

  t.deepEqual(entries, [
    '../repo/src/index.js',
    '../repo/src/lib/util.js',
    '!*.test.js',
  ]);
});

test('build_codeblock_entries sorts alphabetically, number of segments, and then separate exclude items to the end', (t) => {
  const entries = build_codeblock_entries({
    context_items: 
    {
      'external:../repo/src/index.js': {
        key: 'external:../repo/src/index.js',
      },
      'external:../repo/src/lib/util.js': {
        key: 'external:../repo/src/lib/util.js',
      },
      'external:../repo-full': {
        key: 'external:../repo-full',
        folder: true,
      },
    },
    exclusions: {
      'this.js': {
        key: 'this.js',
        exclude: true,
      },
    },
  });

  t.deepEqual(entries, [
    '../repo-full/',
    '../repo/src/index.js',
    '../repo/src/lib/util.js',
    '!this.js',
  ]);
});

test('build_codeblock_entries uses explicit identity for extensionless files, folders, blocks, and external exclusions', (t) => {
  const entries = build_codeblock_entries({
    context_items: {
      README: {
        key: 'README',
        kind: 'source',
        source_path: 'README',
      },
      'notes.md': {
        key: 'notes.md',
        kind: 'folder',
        source_path: 'notes.md',
        folder: true,
      },
      'notes/a.md#Heading': {
        key: 'notes/a.md#Heading',
        kind: 'block',
        source_path: 'notes/a.md',
        subpath: 'Heading',
      },
    },
    exclusions: {
      'external:../../cache': {
        key: 'external:../../cache',
        kind: 'folder',
        source_path: '../../cache',
        is_external: true,
        folder: true,
        exclude: true,
      },
    },
  });

  t.true(entries.includes('README'));
  t.true(entries.includes('notes.md/'));
  t.true(entries.includes('notes/a.md#Heading'));
  t.true(entries.includes('!../../cache/'));
});