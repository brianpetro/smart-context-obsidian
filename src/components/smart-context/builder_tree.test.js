import test from 'ava';
import { ContextItem } from 'smart-contexts/context_item.js';
import { normalize_context_item_data } from 'smart-contexts/context_items.js';
import { ImageContextItemAdapter } from 'smart-contexts/adapters/context-items/image.js';
import { PdfContextItemAdapter } from 'smart-contexts/adapters/context-items/pdf.js';
import { create_builder_fixture } from '../../test_support/context_builder.js';
import { SmartContext } from 'obsidian-smart-env/src/items/smart_context.js';
import { context_item_remove } from 'obsidian-smart-env/src/actions/context-item/remove.js';
import {
  post_process,
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

// Exercise the delegated DOM controls and real render scheduler without a DOM dependency.
function create_tree_element() {
  const element = {
    className: '', dataset: {}, children: [], parentElement: null,
    attributes: {}, listeners: new Map(),
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    replaceChildren() {
      this.children.forEach((child) => { child.parentElement = null; });
      this.children = [];
    },
    setAttribute(key, value) { this.attributes[key] = String(value); },
    getAttribute(key) { return this.attributes[key]; },
    addEventListener(key, callback) { this.listeners.set(key, callback); },
    removeEventListener(key) { this.listeners.delete(key); },
    contains(child) {
      return child === this || this.children.some((item) => item.contains(child));
    },
    matches(selector) {
      const [class_name, attribute] = selector.slice(1).split('[');
      return this.classList.contains(class_name)
        && (!attribute || (attribute === 'data-item-key]' && this.dataset.itemKey !== undefined));
    },
    closest(selector) {
      return this.matches(selector) ? this : this.parentElement?.closest(selector);
    },
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [
        ...(child.matches(selector) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
  };
  element.classList = {
    contains(name) { return element.className.split(' ').includes(name); },
    add(name) { element.className += ` ${name}`; },
  };
  return element;
}

function create_removal_fixture(t, options = {}) {
  const saved_globals = new Map(
    ['activeDocument', 'requestAnimationFrame', 'cancelAnimationFrame']
      .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const frames = new Map();
  const trees = [];
  let frame_id = 0;
  globalThis.activeDocument = { createElement: create_tree_element };
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++frame_id, callback);
    return frame_id;
  };
  globalThis.cancelAnimationFrame = (handle) => frames.delete(handle);

  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };
  const frame = async () => {
    const callbacks = Array.from(frames.values());
    frames.clear();
    callbacks.forEach((callback) => callback());
    await settle();
  };
  t.teardown(async () => {
    trees.forEach((tree) => tree.dispose());
    await settle();
    frames.clear();
    saved_globals.forEach((descriptor, key) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  });

  const create_context = (params = {}) => {
    const scope = create_tree_scope({ context_items_data: params.items || options.items || {} });
    scope.ctx.env.is_pro = params.is_pro ?? options.is_pro ?? false;
    scope.ctx.env.obsidian_app = {};
    scope.calls = [];
    scope.notifications = [];
    scope.save_count = 0;
    scope.hydration_count = 0;
    scope.ctx.env.events.on('notification:error', (payload) => scope.notifications.push(payload));
    scope.ctx.emit_event = (key, payload) => scope.events.emit(key, { item_key: 'Current', ...payload });
    scope.ctx.queue_save = () => { scope.save_count += 1; };
    scope.ctx.context_items.filter = (filter) => {
      scope.hydration_count += 1;
      const items = Object.entries(scope.ctx.data.context_items)
        .map(([key, data]) => ({ key, data, exists: true }));
      return filter ? items.filter(filter) : items;
    };
    scope.apply = (targets) => SmartContext.prototype.remove_by_paths.call(scope.ctx, targets);
    scope.remove = params.remove || options.remove || scope.apply;
    scope.ctx.remove_by_paths = (targets) => {
      scope.calls.push(targets);
      return scope.remove(targets);
    };
    scope.ctx.remove_by_path = SmartContext.prototype.remove_by_path;
    return scope;
  };
  const scope = create_context();
  const mount = (source = scope, params = {}) => {
    const container = create_tree_element();
    const snapshots = [];
    let disposers = [];
    const view = {
      attach_disposer(_container, callbacks) {
        disposers = callbacks.filter((callback) => typeof callback === 'function');
      },
    };
    post_process.call(view, source.ctx, container, {
      ...params,
      on_resolved_items(items) { snapshots.push(items.map((item) => item.key)); },
    });
    const dispatch = (type, target) => {
      const event = {
        target, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
      };
      container.listeners.get(type)?.(event);
      return event;
    };
    const tree = {
      container, snapshots,
      rows: () => container.querySelectorAll('.sc-context-builder-tree-row').map((row) => row.dataset.path),
      row: (path) => container.querySelectorAll('.sc-context-builder-tree-row').find((row) => row.dataset.path === path),
      remove(path) {
        return dispatch('click', this.row(path).querySelector('.sc-context-builder-tree-remove'));
      },
      menu(path) {
        let result;
        source.ctx.env.build_menu = (_placement, menu, _item, menu_params) => {
          result = menu_params;
          // Only placement presence is needed here; the removal action is invoked below.
          menu.items.push({});
        };
        const event = dispatch('contextmenu', this.row(path));
        t.true(event.prevented);
        t.true(event.stopped);
        return result;
      },
      click(selector) { return dispatch('click', container.querySelector(selector)); },
      dispose() {
        disposers.forEach((dispose) => dispose());
        disposers = [];
      },
    };
    trees.push(tree);
    return tree;
  };
  return { ...scope, scope, mount, create_context, frame, settle, frames };
}

function create_pending_mutation() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test.serial('Builder batches adjacent inline removals and hides them without rehydrating', async (t) => {
  const fixture = create_removal_fixture(t, { items: { 'a.md': {}, 'b.md': {}, 'c.md': {} } });
  const tree = fixture.mount();
  const event = tree.remove('a.md');
  tree.remove('b.md');
  t.true(event.prevented);
  t.true(event.stopped);
  t.deepEqual(tree.rows(), ['c.md']);
  t.deepEqual(tree.snapshots.at(-1), ['c.md']);
  t.is(fixture.scope.hydration_count, 1);
  t.is(fixture.calls.length, 0);
  t.is(fixture.frames.size, 1);
  await fixture.frame();
  t.deepEqual(fixture.calls, [[{ path: 'a.md', folder: false }, { path: 'b.md', folder: false }]]);
  t.deepEqual(Object.keys(fixture.ctx.data.context_items), ['c.md']);
  t.is(fixture.scope.save_count, 1);
  t.deepEqual(tree.rows(), ['c.md']);
  t.is(fixture.frames.size, 0);
});

test.serial('Builder menu and inline removal share batching and folder metadata', async (t) => {
  const fixture = create_removal_fixture(t, { is_pro: true, items: { Docs: { folder: true }, 'keep.md': {}, 'a.md': {} } });
  const tree = fixture.mount();
  const menu = tree.menu('Docs');
  t.true(await context_item_remove.call(menu.context_item, menu));
  tree.remove('a.md');
  t.deepEqual(tree.rows(), ['keep.md']);
  t.is(fixture.calls.length, 0);
  await fixture.frame();
  t.deepEqual(fixture.calls, [[{ path: 'Docs', folder: true }, { path: 'a.md', folder: false }]]);
});

for (const folder_first of [false, true]) {
  test.serial(`Builder merges duplicate normalized targets with folder_first=${folder_first}`, async (t) => {
    const fixture = create_removal_fixture(t, { is_pro: true, items: { Docs: { folder: true } } });
    const tree = fixture.mount();
    const button = tree.row('Docs').querySelector('.sc-context-builder-tree-remove');
    const menu = tree.menu('Docs');
    button.dataset.folder = String(folder_first);
    menu.on_remove();
    button.dataset.folder = String(!folder_first);
    button.dataset.path = 'Docs/';
    menu.on_remove();
    menu.on_remove();
    await fixture.frame();
    t.deepEqual(fixture.calls, [[{ path: 'Docs', folder: true }]]);
  });
}

for (const parent_first of [false, true]) {
  test.serial(`Builder compresses parent and child requests with parent_first=${parent_first}`, async (t) => {
    const fixture = create_removal_fixture(t, { items: { 'Docs/a.md': {}, 'Docs/b.md': {}, 'Docsmith/c.md': {} } });
    const tree = fixture.mount();
    const child_menu = tree.menu('Docs/a.md');
    if (parent_first) tree.remove('Docs');
    child_menu.on_remove();
    if (!parent_first) tree.remove('Docs');
    t.deepEqual(tree.rows(), ['Docsmith', 'Docsmith/c.md']);
    await fixture.frame();
    t.deepEqual(fixture.calls, [[{ path: 'Docs', folder: true }]]);
  });
}

test.serial('Builder pending source removal hides blocks but not similar or external identities', async (t) => {
  const fixture = create_removal_fixture(t, { items: {
    'a.md': {}, 'a.md#Heading': {}, 'a.md#Heading#{1}': {}, 'a.md2': {}, 'external:other/a.md': {},
  } });
  const tree = fixture.mount();
  tree.remove('a.md');
  t.deepEqual(tree.snapshots.at(-1), ['a.md2', 'external:other/a.md']);
  await fixture.frame();
  t.deepEqual(fixture.calls, [[{ path: 'a.md', folder: false }]]);
  t.deepEqual(Object.keys(fixture.ctx.data.context_items), ['a.md2', 'external:other/a.md']);
});

test.serial('Builder keeps in-flight removals hidden through updates and serializes later batches', async (t) => {
  const pending = create_pending_mutation();
  const fixture = create_removal_fixture(t, { items: { 'a.md': {}, 'b.md': {}, 'c.md': {} } });
  fixture.scope.remove = () => pending.promise;
  const tree = fixture.mount();
  const menu = tree.menu('a.md');
  menu.on_remove();
  await fixture.frame();
  menu.on_remove();
  fixture.events.emit('context:updated', { item_key: 'Current' });
  await fixture.frame();
  t.deepEqual(tree.rows(), ['b.md', 'c.md']);
  tree.remove('b.md');
  await fixture.frame();
  t.is(fixture.calls.length, 1);
  t.deepEqual(tree.rows(), ['c.md']);
  fixture.scope.remove = fixture.apply;
  pending.resolve(fixture.apply(fixture.calls[0]));
  await fixture.settle();
  t.deepEqual(tree.rows(), ['c.md']);
  await fixture.frame();
  t.deepEqual(fixture.calls, [[{ path: 'a.md', folder: false }], [{ path: 'b.md', folder: false }]]);
  t.deepEqual(tree.rows(), ['c.md']);
});

test.serial('Builder retains a stronger folder request arriving during an in-flight removal', async (t) => {
  const pending = create_pending_mutation();
  const fixture = create_removal_fixture(t, { is_pro: true, items: { Docs: { folder: true } }, remove: () => pending.promise });
  const tree = fixture.mount();
  const button = tree.row('Docs').querySelector('.sc-context-builder-tree-remove');
  const menu = tree.menu('Docs');
  button.dataset.folder = 'false';
  menu.on_remove();
  await fixture.frame();
  button.dataset.folder = 'true';
  menu.on_remove();
  await fixture.frame();
  t.is(fixture.calls.length, 1);
  fixture.scope.remove = fixture.apply;
  pending.resolve([]);
  await fixture.settle();
  t.deepEqual(tree.rows(), []);
  await fixture.frame();
  t.deepEqual(fixture.calls, [[{ path: 'Docs', folder: false }], [{ path: 'Docs', folder: true }]]);
});

test.serial('Builder reconciles no-op removals from actual membership without an error', async (t) => {
  const fixture = create_removal_fixture(t, { items: { 'a.md': {} }, remove: () => [] });
  const tree = fixture.mount();
  tree.remove('a.md');
  t.deepEqual(tree.rows(), []);
  await fixture.frame();
  t.deepEqual(tree.rows(), ['a.md']);
  t.deepEqual(fixture.notifications, []);
  tree.remove('a.md');
  await fixture.frame();
  t.is(fixture.calls.length, 2);
});

test.serial('Builder restores truthful rows and emits an error after a synchronous partial failure', async (t) => {
  const fixture = create_removal_fixture(t, { items: { 'a.md': {}, 'b.md': {} } });
  fixture.scope.remove = () => {
    delete fixture.ctx.data.context_items['a.md'];
    throw new Error('save failed');
  };
  const tree = fixture.mount();
  tree.remove('a.md');
  tree.remove('b.md');
  await fixture.frame();
  t.deepEqual(tree.rows(), ['b.md']);
  t.is(fixture.notifications.length, 1);
  t.is(fixture.notifications[0].details, 'save failed');
  t.is(fixture.notifications[0].event_source, 'context_builder.tree_remove');
  fixture.scope.remove = fixture.apply;
  tree.remove('b.md');
  await fixture.frame();
  t.deepEqual(tree.rows(), []);
});

test.serial('Builder catches asynchronous failures without dropping later queued requests', async (t) => {
  const pending = create_pending_mutation();
  const fixture = create_removal_fixture(t, { items: { 'a.md': {}, 'b.md': {} }, remove: () => pending.promise });
  const tree = fixture.mount();
  tree.remove('a.md');
  await fixture.frame();
  tree.remove('b.md');
  await fixture.frame();
  fixture.scope.remove = fixture.apply;
  pending.reject(new Error('remove rejected'));
  await fixture.settle();
  t.deepEqual(tree.rows(), ['a.md']);
  t.is(fixture.notifications.length, 1);
  t.is(fixture.notifications[0].details, 'remove rejected');
  await fixture.frame();
  t.deepEqual(fixture.calls[1], [{ path: 'b.md', folder: false }]);
  t.deepEqual(tree.rows(), ['a.md']);
});

test.serial('Builder disposal flushes accepted requests without rendering a disposed tree', async (t) => {
  const fixture = create_removal_fixture(t, { items: { 'a.md': {}, 'b.md': {} } });
  const tree = fixture.mount();
  tree.remove('a.md');
  tree.remove('b.md');
  const render_count = tree.snapshots.length;
  tree.dispose();
  t.deepEqual(fixture.calls, [[{ path: 'a.md', folder: false }, { path: 'b.md', folder: false }]]);
  await fixture.settle();
  fixture.events.emit('context:updated', { item_key: 'Current' });
  await fixture.frame();
  t.is(fixture.calls.length, 1);
  t.is(tree.snapshots.length, render_count);
  t.is(tree.container.listeners.size, 0);
});

test.serial('Builder handoff shares pending state and updates only the replacement tree', async (t) => {
  const pending = create_pending_mutation();
  const fixture = create_removal_fixture(t, { items: { 'a.md': {}, 'b.md': {}, 'c.md': {} }, remove: () => pending.promise });
  const old_tree = fixture.mount();
  old_tree.remove('a.md');
  await fixture.frame();
  old_tree.remove('b.md');
  old_tree.dispose();
  const old_render_count = old_tree.snapshots.length;
  const new_tree = fixture.mount();
  t.deepEqual(new_tree.rows(), ['c.md']);
  fixture.scope.remove = fixture.apply;
  pending.resolve(fixture.apply(fixture.calls[0]));
  await fixture.settle();
  await fixture.frame();
  t.deepEqual(new_tree.rows(), ['c.md']);
  t.is(fixture.calls.length, 2);
  t.is(old_tree.snapshots.length, old_render_count);
});

test.serial('Builder disposal during an in-flight batch still commits the remaining queue', async (t) => {
  const pending = create_pending_mutation();
  const fixture = create_removal_fixture(t, { items: { 'a.md': {}, 'b.md': {} }, remove: () => pending.promise });
  const tree = fixture.mount();
  tree.remove('a.md');
  await fixture.frame();
  tree.remove('b.md');
  tree.dispose();
  fixture.scope.remove = fixture.apply;
  pending.resolve(fixture.apply(fixture.calls[0]));
  await fixture.settle();
  await fixture.frame();
  t.is(fixture.calls.length, 2);
  t.deepEqual(Object.keys(fixture.ctx.data.context_items), []);
});

test.serial('Builder trees share one queue per Context but isolate distinct Context objects', async (t) => {
  const fixture = create_removal_fixture(t, { items: { 'a.md': {}, 'b.md': {} } });
  const first_tree = fixture.mount();
  const second_tree = fixture.mount();
  const other_scope = fixture.create_context();
  const other_tree = fixture.mount(other_scope);
  first_tree.remove('a.md');
  t.deepEqual(second_tree.rows(), ['b.md']);
  t.deepEqual(other_tree.rows(), ['a.md', 'b.md']);
  second_tree.remove('b.md');
  first_tree.dispose();
  t.is(fixture.calls.length, 0);
  await fixture.frame();
  t.is(fixture.calls.length, 1);
  t.deepEqual(second_tree.rows(), []);
  t.deepEqual(other_scope.calls, []);
});

test.serial('Builder ignores a stale menu callback after the owning tree is disposed', async (t) => {
  const fixture = create_removal_fixture(t, { items: { 'a.md': {} } });
  const tree = fixture.mount();
  const menu = tree.menu('a.md');
  tree.dispose();
  menu.on_remove();
  await fixture.frame();
  t.deepEqual(fixture.calls, []);
});

test.serial('Core inline and menu controls both protect branches with inherited descendants', async (t) => {
  const fixture = create_removal_fixture(t, { items: {
    'Notes/a.md': {}, 'Notes/a.md#Shared': { from_named_context: 'Shared' },
  } });
  const notices = [];
  fixture.events.on('context:named_context_remove_blocked', (payload) => notices.push(payload));
  const tree = fixture.mount();
  tree.remove('Notes');
  tree.remove('Notes/a.md');
  tree.remove('Notes/a.md#Shared');
  const menu = tree.menu('Notes/a.md');
  t.true(menu.remove_disabled);
  t.false(await context_item_remove.call(menu.context_item, menu));
  // Even a direct callback cannot bypass the same disabled inline control.
  menu.on_remove();
  await fixture.frame();
  t.deepEqual(fixture.calls, []);
  t.is(notices.length, 5);
  t.is(notices[0].named_context_name, 'Shared');
});

test.serial('Pro permits the same inherited row through inline and menu removal', async (t) => {
  const fixture = create_removal_fixture(t, { is_pro: true, items: {
    'Notes/a.md': { from_named_context: 'Shared' }, 'Notes/b.md': { from_folder: 'Notes' },
  } });
  const tree = fixture.mount();
  const menu = tree.menu('Notes/a.md');
  t.false(menu.remove_disabled);
  await context_item_remove.call(menu.context_item, menu);
  tree.remove('Notes/b.md');
  t.deepEqual(tree.rows(), []);
  await fixture.frame();
  t.deepEqual(fixture.calls, [[{ path: 'Notes/a.md', folder: false }, { path: 'Notes/b.md', folder: false }]]);
});

test.serial('Builder lazy expansion and show-more cannot redisplay an in-flight target', async (t) => {
  const pending = create_pending_mutation();
  const items = Object.fromEntries(Array.from({ length: 125 }, (_, index) => [
    `Docs/${String(index).padStart(3, '0')}.md`, {},
  ]));
  const fixture = create_removal_fixture(t, { items, remove: () => pending.promise });
  const tree = fixture.mount();
  tree.click('.sc-context-builder-tree-toggle-all');
  tree.remove('Docs/000.md');
  await fixture.frame();
  tree.click('.sc-context-builder-tree-show-more');
  tree.click('.sc-context-builder-tree-toggle-all');
  tree.click('.sc-context-builder-tree-toggle-all');
  t.false(tree.rows().includes('Docs/000.md'));
  t.true(tree.rows().includes('Docs/124.md'));
  fixture.events.emit('context:updated', { item_key: 'Current' });
  await fixture.frame();
  t.false(tree.rows().includes('Docs/000.md'));
  pending.resolve(fixture.apply(fixture.calls[0]));
  await fixture.settle();
  t.false(tree.rows().includes('Docs/000.md'));
});

test.serial('Builder retains the external prefix when removing a structural relative external folder', async (t) => {
  const fixture = create_removal_fixture(t, { is_pro: true, items: {
    'external:../repo/docs/a.md': {}, 'external:../repo/docs/b.md': {}, 'docs/keep.md': {},
  } });
  const tree = fixture.mount();
  tree.remove('external:../repo/docs');
  t.deepEqual(tree.snapshots.at(-1), ['docs/keep.md']);
  await fixture.frame();
  t.deepEqual(fixture.calls, [[{ path: 'external:../repo/docs', folder: true }]]);
  t.deepEqual(Object.keys(fixture.ctx.data.context_items), ['docs/keep.md']);
});

test.serial('Builder accepts separate batches across frames without requiring one human-click batch', async (t) => {
  const fixture = create_removal_fixture(t, { items: { 'a.md': {}, 'b.md': {} } });
  const tree = fixture.mount();
  tree.remove('a.md');
  await fixture.frame();
  tree.remove('b.md');
  t.deepEqual(tree.rows(), []);
  await fixture.frame();
  t.deepEqual(fixture.calls, [[{ path: 'a.md', folder: false }], [{ path: 'b.md', folder: false }]]);
});

test.serial('Builder queues removals through the scheduler timeout fallback', async (t) => {
  const fixture = create_removal_fixture(t, { items: { 'a.md': {}, 'b.md': {} } });
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
  const tree = fixture.mount();
  tree.remove('a.md');
  tree.remove('b.md');
  t.is(fixture.calls.length, 0);
  t.true(await wait_for(() => fixture.calls.length === 1));
  t.deepEqual(fixture.calls, [[{ path: 'a.md', folder: false }, { path: 'b.md', folder: false }]]);
  t.deepEqual(tree.rows(), []);
});

test.serial('Builder reports an asynchronous failure after disposal and restores a replacement tree', async (t) => {
  const pending = create_pending_mutation();
  const fixture = create_removal_fixture(t, { items: { 'a.md': {} }, remove: () => pending.promise });
  const old_tree = fixture.mount();
  old_tree.remove('a.md');
  old_tree.dispose();
  const new_tree = fixture.mount();
  t.deepEqual(new_tree.rows(), []);
  pending.reject(new Error('late failure'));
  await fixture.settle();
  t.deepEqual(new_tree.rows(), ['a.md']);
  t.is(fixture.notifications.length, 1);
  t.is(fixture.notifications[0].details, 'late failure');
});


test.serial('Builder item labels delegate to the host and retain direct opening when no host is supplied', async (t) => {
  const fixture = create_builder_fixture(t);
  const item = fixture.ctx.context_items.filter()[0];
  fixture.ctx.context_items.filter = () => [item];
  const received = [];
  const tree = fixture.doc.body.createDiv();
  post_process.call(fixture.smart_view, fixture.ctx, tree, {
    on_open_item(context_item, event) { received.push({ context_item, event }); },
  });
  const event = await tree.dispatch('click', { target: tree.querySelector('.sc-context-builder-tree-name[data-item-key]'), ctrlKey: true });
  await fixture.settle();
  t.deepEqual(received, [{ context_item: item, event }]);
  t.false(fixture.calls.some((call) => call[0] === 'source'));
  const direct = fixture.doc.body.createDiv();
  post_process.call(fixture.smart_view, fixture.ctx, direct);
  const direct_event = await direct.dispatch('click', { target: direct.querySelector('.sc-context-builder-tree-name[data-item-key]') });
  await fixture.settle();
  t.deepEqual(fixture.calls.at(-1), ['source', 'a.md', direct_event]);
});

test.serial('Builder reports host source-opening failures without mutating membership', async (t) => {
  const fixture = create_builder_fixture(t);
  const tree = fixture.doc.body.createDiv();
  post_process.call(fixture.smart_view, fixture.ctx, tree, {
    async on_open_item() { throw new Error('handoff failed'); },
  });
  await tree.dispatch('click', { target: tree.querySelector('.sc-context-builder-tree-name[data-item-key]') });
  await fixture.settle();
  t.deepEqual(Object.keys(fixture.ctx.data.context_items), ['a.md']);
  t.is(fixture.notifications.length, 1);
  t.is(fixture.notifications[0].event_source, 'context_builder.tree_open_item');
});

test.serial('Builder source-menu Open uses the same host callback while other configured actions remain intact', async (t) => {
  const fixture = create_builder_fixture(t);
  const context_item = fixture.ctx.context_items.filter()[0];
  context_item.item_ref = { key: 'a.md', env: fixture.env };
  fixture.ctx.context_items.filter = () => [context_item];
  const received = [];
  let open_click, other_click;
  const other_action = () => 'other configured action';
  fixture.env.build_menu = (placement, menu) => {
    if (placement !== 'source:menu') return;
    menu.addItem((item) => {
      item._action_key = 'source_open';
      item.onClick = (callback) => { open_click = callback; return item; };
      item.onClick(() => t.fail('unmediated source open'));
    });
    menu.addItem((item) => {
      item._action_key = 'other_action';
      item.onClick = (callback) => { other_click = callback; return item; };
      item.onClick(other_action);
    });
  };
  const tree = fixture.doc.body.createDiv();
  post_process.call(fixture.smart_view, fixture.ctx, tree, {
    on_open_item(item, event) { received.push({ item, event }); },
  });
  await tree.dispatch('contextmenu', { target: tree.querySelector('.sc-context-builder-tree-row[data-item-key]') });
  const event = { metaKey: true };
  await open_click(event);
  t.deepEqual(received, [{ item: context_item, event }]);
  t.is(other_click, other_action);
  tree.remove();
  await open_click(event);
  t.is(received.length, 1);
});


test.serial('review rows place removal last while modal row order remains unchanged', async (t) => {
  const fixture = create_removal_fixture(t, { items: { 'Docs/a.md': { size: 100 }, 'Docs/b.md': { size: 300 } } });
  const review = fixture.mount(fixture.scope, { surface: 'context_builder_view' });
  const modal = fixture.mount();
  for (const path of ['Docs', 'Docs/a.md']) {
    const review_row = review.row(path);
    const modal_row = modal.row(path);
    t.true(review_row.children.at(-1).classList.contains('sc-context-builder-tree-remove'));
    t.true(modal_row.children[1].classList.contains('sc-context-builder-tree-remove'));
    t.is(review_row.querySelector('.sc-context-builder-tree-name').getAttribute('title'), path);
    t.is(modal_row.querySelector('.sc-context-builder-tree-name').getAttribute('title'), undefined);
  }
  const size = review.row('Docs/a.md').querySelector('.sc-context-builder-tree-size');
  t.is(size.textContent, '25% ');
  t.is(size.getAttribute('title'), '25% (100 B)');
  t.is(size.querySelector('.sc-context-builder-tree-size-bytes').textContent, '(100 B)');
  t.is(modal.row('Docs/a.md').querySelector('.sc-context-builder-tree-size').textContent, '25% (100 B)');
  review.remove('Docs/a.md');
  t.deepEqual(review.rows(), ['Docs', 'Docs/b.md']);
  t.deepEqual(modal.rows(), ['Docs', 'Docs/b.md']);
  await fixture.frame();
  t.deepEqual(fixture.calls, [[{ path: 'Docs/a.md', folder: false }]]);
});

test.serial('review full-path tooltips retain preview and missing-source information', (t) => {
  const fixture = create_removal_fixture(t, { items: { 'Docs/a.md': {} } });
  fixture.ctx.context_items.filter = () => [
    { key: 'Docs/a.md', data: {}, exists: true, item_ref: { key: 'Docs/a.md', env: { plugin: { app: {} } } } },
    { key: 'Docs/missing.md', data: {}, exists: false },
  ];
  const review = fixture.mount(fixture.scope, { surface: 'context_builder_view' });
  const title = review.row('Docs/a.md').querySelector('.sc-context-builder-tree-name').getAttribute('title');
  t.regex(title, /^Docs\/a\.md\nHold .+ to preview$/);
  t.is(review.row('Docs/missing.md').querySelector('.sc-context-builder-tree-name').getAttribute('title'), 'Docs/missing.md\nMissing source');
});

for (const [key, adapter_class, surface] of [
  ['Attachments/Plan.png', ImageContextItemAdapter],
  ['Attachments/Plan.pdf', PdfContextItemAdapter],
  ['Attachments/Plan.png', ImageContextItemAdapter, 'context_builder_view'],
  ['Attachments/Plan.pdf', PdfContextItemAdapter, 'context_builder_view'],
]) {
  test.serial(`Builder ${surface || 'modal'} retains excluded ${key}, links to settings, and restores its normal row after refresh`, async (t) => {
    const fixture = create_removal_fixture(t, { items: { [key]: {} } });
    let excluded = true;
    const settings_calls = [];
    fixture.ctx.env.obsidian_app.setting = {
      open() { settings_calls.push('open'); },
      openTabById(id) { settings_calls.push(id); },
    };
    fixture.ctx.env.smart_sources = {
      fs: {
        is_excluded: () => excluded,
        exists_sync() {
          if (excluded) throw new Error('Path is excluded');
          return true;
        },
      },
    };
    const item = Object.assign(Object.create(ContextItem.prototype), {
      data: normalize_context_item_data(key),
      env: fixture.ctx.env,
    });
    item._context_type_adapter = new adapter_class(item);
    fixture.ctx.context_items.filter = () => [item];

    let reveal_missing;
    const tree = fixture.mount(fixture.scope, {
      surface,
      on_ready(callback) { reveal_missing = callback; },
    });
    const row = tree.row(key);
    t.truthy(row);
    t.true(row.classList.contains('is-missing'));
    t.true(row.classList.contains('is-env-excluded'));
    t.true(row.querySelector('.sc-context-builder-tree-name').disabled);
    t.true(reveal_missing());
    const warning = tree.row(key).querySelector('.sc-context-builder-tree-env-excluded');
    t.is(warning.type, 'button');
    t.is(warning.textContent, 'Environment exclusion - Review');
    t.regex(warning.getAttribute('title'), /Settings > Smart Environment > Sources/);
    t.regex(warning.getAttribute('aria-label'), /Excluded by Smart Environment settings/);
    const name = tree.row(key).querySelector('.sc-context-builder-tree-name');
    const row_children = tree.row(key).children;
    if (surface === 'context_builder_view') {
      t.is(name.getAttribute('title'), `${key}\n${warning.getAttribute('title')}`);
      t.true(row_children.at(-1).classList.contains('sc-context-builder-tree-remove'));
    } else {
      t.is(name.getAttribute('title'), warning.getAttribute('title'));
      t.true(row_children[1].classList.contains('sc-context-builder-tree-remove'));
    }
    const event = tree.click('.sc-context-builder-tree-env-excluded');
    t.true(event.prevented);
    t.true(event.stopped);
    t.deepEqual(settings_calls, ['open', 'smart-environment']);
    t.truthy(fixture.ctx.data.context_items[key]);
    t.deepEqual(fixture.notifications, []);

    excluded = false;
    fixture.events.emit('context:updated', { item_key: 'Current' });
    await fixture.frame();
    t.false(tree.row(key).classList.contains('is-missing'));
    t.false(tree.row(key).classList.contains('is-env-excluded'));
    t.falsy(tree.row(key).querySelector('.sc-context-builder-tree-env-excluded'));
    t.not(tree.row(key).querySelector('.sc-context-builder-tree-name').disabled, true);
    t.false(reveal_missing());
    t.deepEqual(fixture.notifications, []);
  });
}

test.serial('Builder keeps ordinary missing rows distinct from environment exclusions', (t) => {
  const fixture = create_removal_fixture(t, { items: { 'missing.md': {} } });
  fixture.ctx.context_items.filter = () => [{
    key: 'missing.md',
    data: {},
    exists: false,
    is_env_excluded: false,
  }];
  const tree = fixture.mount();
  const row = tree.row('missing.md');

  t.true(row.classList.contains('is-missing'));
  t.false(row.classList.contains('is-env-excluded'));
  t.is(row.querySelector('.sc-context-builder-tree-name').getAttribute('title'), 'Missing source');
  t.is(row.querySelector('.sc-context-builder-tree-warning').getAttribute('aria-label'), 'Missing source');
  t.falsy(row.querySelector('.sc-context-builder-tree-env-excluded'));
});

test.serial('Builder removes an environment-excluded item without changing environment settings', async (t) => {
  const fixture = create_removal_fixture(t, { items: { 'Notes/Plan.md': {} } });
  const filter = fixture.ctx.context_items.filter;
  fixture.ctx.context_items.filter = () => filter().map((item) => ({
    ...item,
    exists: false,
    is_env_excluded: true,
  }));
  const tree = fixture.mount();

  tree.remove('Notes/Plan.md');
  await fixture.frame();

  t.deepEqual(fixture.calls, [[{ path: 'Notes/Plan.md', folder: false }]]);
  t.deepEqual(fixture.ctx.data.context_items, {});
  t.deepEqual(tree.rows(), []);
  t.deepEqual(fixture.notifications, []);
});
