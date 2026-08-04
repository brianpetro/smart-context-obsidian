import test from 'ava';
import { parse_codeblock_line } from './parse_codeblock.js';

test('parse_codeblock_line adds explicit source and block identity', (t) => {
  t.like(parse_codeblock_line('README'), {
    key: 'README',
    kind: 'source',
    source_path: 'README',
  });

  t.like(parse_codeblock_line('notes/a.md#Heading#{1}'), {
    key: 'notes/a.md#Heading#{1}',
    kind: 'block',
    source_path: 'notes/a.md',
    subpath: 'Heading#{1}',
  });
});

test('parse_codeblock_line identifies named contexts explicitly', (t) => {
  t.deepEqual(parse_codeblock_line('ctx:: Shared'), {
    key: 'Shared',
    kind: 'named_context',
    named_context: true,
  });
});
