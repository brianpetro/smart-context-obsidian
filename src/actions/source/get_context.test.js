import test from 'ava';
import {
  build_context_items_from_graphs,
  source_get_context,
} from './get_context.js';

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


function create_source_graph() {
  const smart_contexts = {
    items: {},
    async create_or_update(data) {
      const context = this.items[data.key] || {
        key: data.key,
        data: {
          context_items: {},
        },
      };
      context.data = {
        ...context.data,
        ...data,
        context_items: {
          ...(context.data.context_items || {}),
          ...(data.context_items || {}),
        },
      };
      this.items[data.key] = context;
      return context;
    },
  };
  const collection = {
    items: {},
    links: {},
    get(key) {
      return this.items[key];
    },
  };
  const create_source = (key, outlinks = []) => {
    const source = {
      key,
      path: key,
      outlinks,
      collection,
      env: {
        smart_contexts,
      },
      once_event() {},
    };
    collection.items[key] = source;
    return source;
  };

  const second = create_source('Notes/Second.md');
  const first = create_source('Notes/First.md', [
    { key: second.key },
  ]);
  const root = create_source('Notes/Root.md', [
    { key: first.key },
  ]);

  return {
    root,
    first,
    second,
  };
}

test('source_get_context limits traversal and removes stale linked items', async (t) => {
  const { root, first, second } = create_source_graph();

  const depth_two = await source_get_context.call(root, {
    direction: 'out',
    link_depth: 2,
  });
  t.true(Boolean(depth_two.data.context_items[root.key]));
  t.true(Boolean(depth_two.data.context_items[first.key]));
  t.true(Boolean(depth_two.data.context_items[second.key]));

  depth_two.data.context_items['Notes/Manual.md'] = {
    key: 'Notes/Manual.md',
    d: 0,
  };

  const depth_zero = await source_get_context.call(root, {
    direction: 'out',
    link_depth: 0,
  });
  t.true(Boolean(depth_zero.data.context_items[root.key]));
  t.true(Boolean(depth_zero.data.context_items['Notes/Manual.md']));
  t.false(Boolean(depth_zero.data.context_items[first.key]));
  t.false(Boolean(depth_zero.data.context_items[second.key]));
});

test('source_get_context rejects an invalid link_depth', async (t) => {
  const { root } = create_source_graph();

  await t.throwsAsync(
    () => source_get_context.call(root, { link_depth: 6 }),
    { message: 'link_depth must be an integer from 0 through 5.' },
  );
});
