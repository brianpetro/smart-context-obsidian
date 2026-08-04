import test from 'ava';
import {
  format_size_label,
  get_context_item_icon,
  get_context_item_label,
  get_context_size_totals,
  get_default_expanded_paths,
  get_named_contexts_to_watch,
  get_next_expanded_paths,
  resolve_tree_item_remove_state,
  reveal_missing_tree_items,
} from './builder_tree.js';

test('Builder tree size labels show contribution and readable bytes', (t) => {
  t.is(format_size_label(6758, 25600), '26% (6.6 KB)');
  t.is(format_size_label(1843, 25600), '7.2% (1.8 KB)');
  t.is(format_size_label(0, 25600), '');
  t.is(format_size_label(1, 2000), '<0.1% (1 B)');
});

test('Builder tree calculates text and media contribution totals independently', (t) => {
  t.deepEqual(get_context_size_totals([
    { size: 100, is_media: false },
    { size: 900, is_media: true },
    { size: 50, is_media: false },
  ]), {
    text_total_size: 150,
    media_total_size: 900,
  });
});

test('Builder tree expands small contexts and collapses large contexts by default', (t) => {
  const tree = {
    children: {
      Folder: {
        path: 'Folder',
        is_file: false,
        children: {
          Nested: {
            path: 'Folder/Nested',
            is_file: false,
            children: {
              'Note.md': {
                path: 'Folder/Nested/Note.md',
                is_file: true,
                children: [],
              },
            },
          },
        },
      },
    },
  };

  t.deepEqual(
    Array.from(get_default_expanded_paths(tree, 1)),
    ['Folder', 'Folder/Nested'],
  );
  t.deepEqual(
    Array.from(get_default_expanded_paths(tree, 51)),
    [],
  );
});

test('Builder tree expands newly introduced branches without reopening collapsed existing branches', (t) => {
  const expanded_paths = get_next_expanded_paths(
    new Set(['Existing/Open', 'Removed']),
    new Set(['Existing/Open', 'Existing/Closed', 'Removed']),
    new Set(['Existing/Open', 'Existing/Closed', 'Added', 'Added/Nested']),
    true,
  );

  t.deepEqual(
    Array.from(expanded_paths),
    ['Existing/Open', 'Added', 'Added/Nested'],
  );
});

test('Builder tree leaves newly introduced branches collapsed for large contexts', (t) => {
  const expanded_paths = get_next_expanded_paths(
    new Set(['Existing/Open']),
    new Set(['Existing/Open']),
    new Set(['Existing/Open', 'Added']),
    false,
  );

  t.deepEqual(Array.from(expanded_paths), ['Existing/Open']);
});

test('Builder tree reveals every branch and lazy batch containing missing items', (t) => {
  const files = Object.fromEntries(
    Array.from({ length: 125 }, (_, index) => {
      const name = `${String(index).padStart(3, '0')}.md`;
      return [name, {
        name,
        path: `reference/GTD/${name}`,
        is_file: true,
        exists: index === 124 ? false : true,
        children: [],
      }];
    }),
  );
  const tree = {
    children: {
      reference: {
        name: 'reference',
        path: 'reference',
        is_file: false,
        children: {
          GTD: {
            name: 'GTD',
            path: 'reference/GTD',
            is_file: false,
            children: files,
          },
          PKM: {
            name: 'PKM',
            path: 'reference/PKM',
            is_file: false,
            children: {
              'Missing.md': {
                name: 'Missing.md',
                path: 'reference/PKM/Missing.md',
                is_file: true,
                exists: false,
                children: [],
              },
            },
          },
        },
      },
    },
  };
  const expanded_paths = new Set();
  const visible_child_limits = new Map();

  const found_missing = reveal_missing_tree_items(
    tree,
    new Map(),
    expanded_paths,
    visible_child_limits,
  );

  t.true(found_missing);
  t.true(expanded_paths.has('reference'));
  t.true(expanded_paths.has('reference/GTD'));
  t.true(expanded_paths.has('reference/PKM'));
  t.is(visible_child_limits.get('reference/GTD'), 200);
});

test('Builder tree missing reveal leaves expansion unchanged without missing items', (t) => {
  const tree = {
    children: {
      Folder: {
        name: 'Folder',
        path: 'Folder',
        is_file: false,
        children: {
          'Note.md': {
            name: 'Note.md',
            path: 'Folder/Note.md',
            is_file: true,
            exists: true,
            children: [],
          },
        },
      },
    },
  };
  const expanded_paths = new Set();
  const visible_child_limits = new Map();

  t.false(reveal_missing_tree_items(
    tree,
    new Map(),
    expanded_paths,
    visible_child_limits,
  ));
  t.is(expanded_paths.size, 0);
  t.is(visible_child_limits.size, 0);
});

test('Builder tree labels use local block identity within the source branch', (t) => {
  t.is(
    get_context_item_label({ key: 'reference/GTD/1_next_actions.md' }),
    '1_next_actions.md',
  );
  t.is(
    get_context_item_label(
      { key: 'Notes/Plan.md#Decisions' },
      { name: 'Decisions', kind: 'block' },
    ),
    'Decisions',
  );
  t.is(
    get_context_item_label(
      { key: 'Notes/Plan.md#' },
      { name: '#', kind: 'block' },
    ),
    'Root block',
  );
  t.is(
    get_context_item_label(
      {
        key: 'Notes/Plan.md#Decisions#{1}',
        item_ref: { lines: [12, 18] },
      },
      { name: '#{1}', kind: 'block' },
    ),
    'Lines 12-18',
  );
});

test('Builder tree uses heading icons for block branches and leaves', (t) => {
  t.is(
    get_context_item_icon(null, { kind: 'folder', is_file: false }),
    'folder',
  );
  t.is(
    get_context_item_icon(null, { kind: 'block', is_file: false }),
    'heading',
  );
  t.is(
    get_context_item_icon(
      { data: { kind: 'block' }, icon_type: 'file-text' },
      { kind: 'block', is_file: true },
    ),
    'heading',
  );
});

function create_events() {
  const handlers = new Map();
  return {
    on(event_key, callback) {
      if (!handlers.has(event_key)) handlers.set(event_key, new Set());
      handlers.get(event_key).add(callback);
      return () => handlers.get(event_key)?.delete(callback);
    },
    emit(event_key, payload = {}) {
      for (const callback of handlers.get(event_key) || []) {
        callback(payload);
      }
    },
  };
}


async function wait_for(predicate, timeout_ms = 250) {
  const started_at = Date.now();
  while (!predicate()) {
    if (Date.now() - started_at >= timeout_ms) return false;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return true;
}

function create_tree_scope(params = {}) {
  const events = create_events();
  const named_contexts = params.named_contexts || [];
  const context_items_data = params.context_items_data || {};
  const env = {
    events,
    smart_contexts: {
      get_named_context(name) {
        return named_contexts.find((named_ctx) => {
          return named_ctx?.data?.name === name;
        }) || null;
      },
    },
  };
  named_contexts.forEach((named_ctx) => {
    named_ctx.env = env;
  });
  const ctx = {
    key: 'Current',
    data: {
      key: 'Current',
      context_items: context_items_data,
    },
    env,
    context_items: {
      filter() {
        return [];
      },
    },
    on_event(event_key, callback) {
      return events.on(event_key, (payload = {}) => {
        if (payload.item_key && payload.item_key !== this.key) return;
        callback(payload);
      });
    },
  };
  const container = {
    replaceChildren() {},
    appendChild() {},
    addEventListener() {},
    removeEventListener() {},
    contains() { return false; },
  };
  let disposers = [];
  const view = {
    attach_disposer(_container, next_disposers) {
      disposers = next_disposers.filter((dispose) => typeof dispose === 'function');
    },
  };

  return {
    container,
    ctx,
    events,
    get_disposers() { return disposers; },
    view,
  };
}

test('Builder tree cancels a queued render when its DOM lifecycle ends', async (t) => {
  const scope = create_tree_scope();
  let resolved_count = 0;

  const { post_process } = await import('./builder_tree.js');
  post_process.call(scope.view, scope.ctx, scope.container, {
    on_resolved_items(items) {
      if (Array.isArray(items)) resolved_count += 1;
    },
  });

  t.is(resolved_count, 1);
  scope.events.emit('context:updated', { item_key: 'Current' });
  scope.get_disposers().forEach((dispose) => dispose());
  await new Promise((resolve) => setTimeout(resolve, 25));

  t.is(resolved_count, 1);
});

test('Builder tree refreshes for included named-context updates and unsubscribes on disposal', async (t) => {
  const named_ctx = {
    key: 'Shared-key',
    data: {
      name: 'Shared',
      context_items: {},
    },
  };
  const scope = create_tree_scope({
    named_contexts: [named_ctx],
    context_items_data: {
      Shared: {
        key: 'Shared',
        named_context: true,
      },
    },
  });
  let resolved_count = 0;

  const { post_process } = await import('./builder_tree.js');
  post_process.call(scope.view, scope.ctx, scope.container, {
    on_resolved_items(items) {
      if (Array.isArray(items)) resolved_count += 1;
    },
  });

  scope.events.emit('context:updated', { item_key: 'Shared-key' });
  t.true(await wait_for(() => resolved_count === 2));

  scope.get_disposers().forEach((dispose) => dispose());
  scope.events.emit('context:updated', { item_key: 'Shared-key' });
  t.true(await wait_for(() => resolved_count === 2));
});

test('Builder tree refreshes missing named-context selections on context lifecycle events', async (t) => {
  const scope = create_tree_scope({
    context_items_data: {
      Shared: {
        key: 'Shared',
        named_context: true,
      },
    },
  });
  let resolved_count = 0;

  const { post_process } = await import('./builder_tree.js');
  post_process.call(scope.view, scope.ctx, scope.container, {
    on_resolved_items(items) {
      if (Array.isArray(items)) resolved_count += 1;
    },
  });

  scope.events.emit('context:named', { item_key: 'New-context' });
  t.true(await wait_for(() => resolved_count === 2));

  scope.get_disposers().forEach((dispose) => dispose());
});


test('Core blocks direct and structural removal of named-context children', (t) => {
  const ctx = { env: { is_pro: false } };
  const child = {
    key: 'folder/note.md',
    children: [],
  };
  const folder = {
    key: 'folder',
    children: {
      'note.md': child,
    },
  };
  const context_item_by_key = new Map([
    [
      'folder/note.md',
      {
        key: 'folder/note.md',
        data: { from_named_context: 'Shared' },
      },
    ],
  ]);

  t.deepEqual(
    resolve_tree_item_remove_state(ctx, child, context_item_by_key),
    {
      disabled: true,
      named_context: 'Shared',
    },
  );
  t.deepEqual(
    resolve_tree_item_remove_state(ctx, folder, context_item_by_key),
    {
      disabled: true,
      named_context: 'Shared',
    },
  );
});

test('Pro can remove named-context children as exclusions', (t) => {
  const ctx = { env: { is_pro: true } };
  const tree_item = {
    key: 'folder/note.md',
    children: [],
  };
  const context_item_by_key = new Map([
    [
      'folder/note.md',
      {
        key: 'folder/note.md',
        data: { from_named_context: 'Shared' },
      },
    ],
  ]);

  t.deepEqual(
    resolve_tree_item_remove_state(ctx, tree_item, context_item_by_key),
    {
      disabled: false,
      named_context: '',
    },
  );
});

test('named-context watch discovery includes nested contexts and stops cycles', (t) => {
  const contexts = new Map();
  const env = {
    smart_contexts: {
      get_named_context(name) {
        return contexts.get(name) || null;
      },
    },
  };
  const shared = {
    key: 'Shared-key',
    env,
    data: {
      name: 'Shared',
      context_items: {
        Nested: { key: 'Nested', named_context: true },
      },
    },
  };
  const nested = {
    key: 'Nested-key',
    env,
    data: {
      name: 'Nested',
      context_items: {
        Shared: { key: 'Shared', named_context: true },
      },
    },
  };
  contexts.set('Shared', shared);
  contexts.set('Nested', nested);
  const ctx = {
    key: 'Current',
    env,
    data: {
      context_items: {
        Shared: { key: 'Shared', named_context: true },
      },
    },
  };

  t.deepEqual(
    Array.from(get_named_contexts_to_watch(ctx).keys()),
    ['Shared-key', 'Nested-key'],
  );
});

test('Builder tree does not attach DOM or event listeners when initial hydration fails', async (t) => {
  let dom_listener_count = 0;
  let disposer_attached = false;
  const ctx = {
    data: { context_items: {} },
    env: { events: { on() { t.fail('global events should not attach'); } } },
    get context_items() {
      throw new Error('hydrate failed');
    },
  };
  const container = {
    addEventListener() {
      dom_listener_count += 1;
    },
  };
  const view = {
    attach_disposer() {
      disposer_attached = true;
    },
  };
  const { post_process } = await import('./builder_tree.js');

  t.throws(
    () => post_process.call(view, ctx, container),
    { message: 'hydrate failed' },
  );
  t.is(dom_listener_count, 0);
  t.false(disposer_attached);
});
