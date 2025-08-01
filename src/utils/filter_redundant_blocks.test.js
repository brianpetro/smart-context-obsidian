import test from 'ava';
import { filter_redundant_blocks } from './filter_redundant_blocks.js';

test('removes block items when parent source exists', t => {
  const items = [
    { path: 'foo.md' },
    { path: 'foo.md##a#{1}' },
    { path: 'bar.md##b#{1}' }
  ];
  const result = filter_redundant_blocks(items);
  t.deepEqual(result, [
    { path: 'foo.md' },
    { path: 'bar.md##b#{1}' }
  ]);
});

test('keeps blocks when parent absent', t => {
  const items = [
    { path: 'foo.md##a#{1}' }
  ];
  const result = filter_redundant_blocks(items);
  t.deepEqual(result, items);
});
