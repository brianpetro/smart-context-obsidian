import test from 'ava';
import { parse_codeblock_to_context_items } from './parse_codeblock_to_context_items.js';

function create_smart_contexts_stub() {
  return {
    get(name) {
      if (name !== 'Named Context') return null;
      return {
        data: {
          context_items: {
            'Project/Alpha.md': {
              d: 0,
            },
            'Project/Beta.md': {
              d: 1,
              exclude: true,
            },
          },
        },
      };
    },
    filter() {
      return [];
    },
  };
}

test('parse_codeblock_to_context_items expands named context aliases', (t) => {
  const result = parse_codeblock_to_context_items([
    'ctx:: Named Context',
    'context:: Named Context',
    'smart-context:: Named Context',
  ].join('\n'), {
    smart_contexts: create_smart_contexts_stub(),
  });

  t.deepEqual(result.named_contexts, ['Named Context']);
  t.true(result.context_items.some((item) => item.key === 'Project/Alpha.md'));
  t.false(result.context_items.some((item) => item.key === 'Project/Beta.md'));
});

test('parse_codeblock_to_context_items preserves passthrough external lines in core', (t) => {
  const result = parse_codeblock_to_context_items([
    '../repo/src',
    '!../repo/dist',
    'Project/Alpha.md',
  ].join('\n'));

  t.deepEqual(result.passthrough_lines, ['../repo/src', '!../repo/dist']);
  t.true(result.context_items.some((item) => item.key === 'Project/Alpha.md'));
});
