import test from 'ava';
import { get_selected_note_keys } from './get_selected_note_keys.js';

const create_sources = (entries) => ({
  get(path) {
    return entries.get(path) ?? null;
  },
});

test('get_selected_note_keys collects unique markdown paths with smart source keys', (t) => {
  const sources = create_sources(new Map([
    ['A.md', { key: 'source:a' }],
    ['B.md', { key: 'source:b' }],
  ]));

  const keys = get_selected_note_keys([
    { path: 'A.md', extension: 'md' },
    { path: 'A.md', extension: 'MD' },
    { path: 'B.md', extension: 'md' },
    { path: 'nope.txt', extension: 'txt' },
    { path: null, extension: 'md' },
  ], sources);

  t.deepEqual(keys, ['source:a', 'source:b']);
});

test('get_selected_note_keys returns empty array on invalid inputs', (t) => {
  t.deepEqual(get_selected_note_keys(null, null), []);
  t.deepEqual(get_selected_note_keys([], null), []);
  t.deepEqual(get_selected_note_keys([{ path: 'A.md', extension: 'md' }], {}), []);
});

test('get_selected_note_keys skips files without matching smart source entries', (t) => {
  const sources = create_sources(new Map([
    ['A.md', { key: 'source:a' }],
  ]));

  const keys = get_selected_note_keys([
    { path: 'Missing.md', extension: 'md' },
    { path: 'A.md', extension: 'md' },
    { path: 'Missing.md', extension: 'md' },
  ], sources);

  t.deepEqual(keys, ['source:a']);
});
