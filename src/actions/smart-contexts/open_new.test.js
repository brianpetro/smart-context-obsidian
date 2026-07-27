import test from 'ava';
import { smart_contexts_open_new } from './open_new.js';

function build_scope(params = {}) {
  const created = [];
  const opened = [];
  const scope = {
    env: {
      obsidian_app: {
        workspace: {
          getActiveFile() {
            return params.active_path ? { path: params.active_path } : null;
          },
        },
      },
      smart_sources: {
        get(path) {
          return path === params.active_path
            ? { key: params.active_source_key || path }
            : null
          ;
        },
      },
    },
    new_context(data, opts) {
      const ctx = { data, opts };
      created.push(ctx);
      return ctx;
    },
    open_builder(ctx, builder_params) {
      opened.push({ ctx, builder_params });
      return true;
    },
  };
  return { scope, created, opened };
}

test('normal Builder starts from the active note', (t) => {
  const { scope, created, opened } = build_scope({
    active_path: 'Current.md',
    active_source_key: 'Current.md',
  });

  smart_contexts_open_new.call(scope);

  t.deepEqual(created[0].opts.add_items, ['Current.md']);
  t.deepEqual(opened[0].builder_params.origin, {
    kind: 'active_note',
    source_path: 'Current.md',
    selection_count: 1,
    seeded_keys: ['Current.md'],
  });
});

test('explicit empty seeds keep the Builder empty', (t) => {
  const { scope, created, opened } = build_scope({
    active_path: 'Current.md',
    active_source_key: 'Current.md',
  });

  smart_contexts_open_new.call(scope, {
    add_items: [],
  });

  t.deepEqual(created[0].opts.add_items, []);
  t.deepEqual(opened[0].builder_params.origin, {
    kind: 'empty',
    selection_count: 0,
    seeded_keys: [],
  });
});

test('start_empty keeps the Builder empty without explicit seeds', (t) => {
  const { scope, created, opened } = build_scope({
    active_path: 'Current.md',
    active_source_key: 'Current.md',
  });

  smart_contexts_open_new.call(scope, {
    start_empty: true,
  });

  t.deepEqual(created[0].opts.add_items, []);
  t.deepEqual(opened[0].builder_params.origin, {
    kind: 'empty',
    selection_count: 0,
    seeded_keys: [],
  });
});

test('explicit seeds and origin win over active-note defaults', (t) => {
  const { scope, created, opened } = build_scope({
    active_path: 'Current.md',
  });

  smart_contexts_open_new.call(scope, {
    add_items: ['A.md', 'A.md', 'B.md'],
    origin: {
      kind: 'file_selection',
      selection_count: 2,
    },
  });

  t.deepEqual(created[0].opts.add_items, ['A.md', 'B.md']);
  t.deepEqual(opened[0].builder_params.origin, {
    kind: 'file_selection',
    selection_count: 2,
    seeded_keys: ['A.md', 'B.md'],
  });
});

test('structured seeds preserve item metadata while deduplicating by key', (t) => {
  const { scope, created, opened } = build_scope();
  const scored_item = {
    key: 'A.md',
    score: 0.91,
  };

  smart_contexts_open_new.call(scope, {
    add_items: [
      scored_item,
      { key: 'A.md', score: 0.5 },
      { path: 'B.md', origin: 'lookup' },
    ],
  });

  t.is(created[0].opts.add_items[0], scored_item);
  t.deepEqual(created[0].opts.add_items, [
    scored_item,
    { path: 'B.md', origin: 'lookup' },
  ]);
  t.deepEqual(opened[0].builder_params.origin, {
    kind: 'preselected',
    selection_count: 2,
    seeded_keys: ['A.md', 'B.md'],
  });
});
