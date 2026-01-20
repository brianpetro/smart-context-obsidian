import test from 'ava';
import { build_context_items_from_graphs } from './get_context.js';

test('build_context_items_from_graphs marks inlink-only items', (t) => {
  const root_source = { outlinks: [] };
  const outlink_graph = [
    { depth: 0, item: { key: 'root', mtime: 1, size: 10 } },
    { depth: 1, item: { key: 'out', mtime: 2, size: 5 } },
  ];
  const inlink_graph = [
    { depth: 0, item: { key: 'root', mtime: 1, size: 10 } },
    { depth: 1, item: { key: 'in', mtime: 3, size: 7 } },
    { depth: 1, item: { key: 'out', mtime: 2, size: 5 } },
  ];

  const context_items = build_context_items_from_graphs({
    outlink_graph,
    inlink_graph,
    root_source,
  });

  t.is(context_items.root.inlink, false);
  t.is(context_items.out.inlink, false);
  t.is(context_items.in.inlink, true);
  t.is(context_items.in.d, 1);
});
