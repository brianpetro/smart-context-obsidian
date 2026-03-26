import test from 'ava';
import {
  build_depth_suggestions,
  build_without_codeblock_depth_zero_context_items,
  format_context_estimate,
  round_up_context_estimate,
} from './context_suggestions.js';

test('build_depth_suggestions returns empty list when no items are provided', (t) => {
  t.deepEqual(build_depth_suggestions([]), []);
  t.deepEqual(build_depth_suggestions(null), []);
});

test('build_depth_suggestions tracks inlinks separately per depth without duplicating depth 0', (t) => {
  const ctx_items = [
    { data: { d: 0, inlink: false }, size: 10 },
    { data: { d: 1, inlink: true }, size: 5 },
    { data: { d: 1 }, size: 20 },
  ];

  const suggestions = build_depth_suggestions(ctx_items);

  const depth_0_suggestions = suggestions.filter((item) => item.d === 0);
  const depth_1_outlinks = suggestions.find(
    (item) => item.d === 1 && item.variant === 'outlinks_only',
  );
  const depth_1_inlinks = suggestions.find(
    (item) => item.d === 1 && item.include_inlinks === true,
  );

  t.is(depth_0_suggestions.length, 1);
  t.is(depth_0_suggestions[0].count, 1);
  t.is(depth_0_suggestions[0].variant, 'outlinks_only');

  t.is(depth_1_outlinks.count, 2);
  t.is(depth_1_inlinks.count, 3);
  t.is(depth_1_outlinks.size, 30);
  t.is(depth_1_inlinks.size, 35);
});

test('build_depth_suggestions adds a depth 0 without-codeblock option when it changes the result', (t) => {
  const ctx_items = [
    { key: 'root.md', data: { d: 0, inlink: false }, size: 10 },
    { key: 'extra.md', data: { d: 0, inlink: false }, size: 20 },
    { key: 'linked.md', data: { d: 1, inlink: false }, size: 30 },
  ];
  const raw_context_items = [
    {
      key: 'root.md',
      d: 0,
      size: 10,
      base_context: true,
      base_d: 0,
      base_inlink: false,
    },
    {
      key: 'extra.md',
      size: 20,
      from_codeblock: true,
      base_context: false,
      base_d: Number.POSITIVE_INFINITY,
      base_inlink: false,
    },
    {
      key: 'linked.md',
      d: 1,
      size: 30,
      base_context: true,
      base_d: 1,
      base_inlink: false,
    },
  ];

  const suggestions = build_depth_suggestions(ctx_items, { raw_context_items });
  const depth_0_suggestions = suggestions.filter((item) => item.d === 0);

  t.deepEqual(
    depth_0_suggestions.map((item) => item.variant),
    ['outlinks_only', 'without_codeblock'],
  );
  t.is(depth_0_suggestions[0].count, 2);
  t.is(depth_0_suggestions[0].size, 30);
  t.is(depth_0_suggestions[1].count, 1);
  t.is(depth_0_suggestions[1].size, 10);
});

test('build_without_codeblock_depth_zero_context_items restores base depth metadata', (t) => {
  const raw_context_items = [
    {
      key: 'root.md',
      d: 3,
      size: 10,
      from_codeblock: true,
      base_context: true,
      base_d: 0,
      base_inlink: false,
    },
    {
      key: 'child.md',
      d: 1,
      size: 5,
      base_context: true,
      base_d: 1,
      base_inlink: false,
    },
  ];

  const context_items = build_without_codeblock_depth_zero_context_items(raw_context_items);

  t.deepEqual(context_items, {
    'root.md': {
      key: 'root.md',
      d: 0,
      size: 10,
      inlink: false,
    },
  });
});

test('context estimate rounding always rounds up to 500 or 1000', (t) => {
  t.is(round_up_context_estimate(867), 1000);
  t.is(format_context_estimate(867), '1K');

  t.is(round_up_context_estimate(1103), 1500);
  t.is(format_context_estimate(1103), '1.5K');

  t.is(round_up_context_estimate(10001), 11000);
  t.is(format_context_estimate(10001), '11K');
});
