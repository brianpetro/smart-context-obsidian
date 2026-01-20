import test from 'ava';
import { build_depth_suggestions } from './context_suggestions.js';

test('build_depth_suggestions returns empty list when no items are provided', (t) => {
  t.deepEqual(build_depth_suggestions([]), []);
  t.deepEqual(build_depth_suggestions(null), []);
});

test('build_depth_suggestions tracks inlinks separately per depth', (t) => {
  const ctx_items = [
    { data: { d: 0, inlink: false }, size: 10 },
    { data: { d: 1, inlink: true }, size: 5 },
    { data: { d: 1 }, size: 20 },
  ];

  const suggestions = build_depth_suggestions(ctx_items);

  const depth_0_outlinks = suggestions.find(
    (item) => item.d === 0 && item.include_inlinks === false,
  );
  const depth_0_inlinks = suggestions.find(
    (item) => item.d === 0 && item.include_inlinks === true,
  );
  const depth_1_outlinks = suggestions.find(
    (item) => item.d === 1 && item.include_inlinks === false,
  );
  const depth_1_inlinks = suggestions.find(
    (item) => item.d === 1 && item.include_inlinks === true,
  );

  t.is(depth_0_outlinks.count, 1);
  t.is(depth_0_inlinks.count, 1);
  t.is(depth_1_outlinks.count, 2);
  t.is(depth_1_inlinks.count, 3);
  t.is(depth_1_outlinks.size, 30);
  t.is(depth_1_inlinks.size, 35);
});
