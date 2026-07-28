import test from 'ava';
import { context_add } from './context/add.js';
import { context_get } from './context/get.js';
import { context_read } from './context/read.js';
import { context_remove } from './context/remove.js';
import { smart_contexts_create } from './smart-contexts/create.js';
import { smart_contexts_list } from './smart-contexts/list.js';
import {
  context_name_action_scope,
  normalize_context_item_key,
} from '../utils/tool_context.js';

function create_context(collection, key, name) {
  return {
    env: collection.env,
    collection,
    key,
    data: {
      key,
      name,
      context_items: {},
    },
    queue_save() {
      this.queued = true;
    },
    add_items(items) {
      items.forEach((item) => {
        this.data.context_items[item.key] = {
          key: item.key,
          d: 0,
        };
      });
    },
    remove_by_path(item_key) {
      if (!this.data.context_items[item_key]) return [];
      delete this.data.context_items[item_key];
      return [item_key];
    },
    async get_text() {
      return `<context>${name}</context>`;
    },
  };
}

function create_collection() {
  const env = {
    config: {
      actions: {},
    },
    plugin: {
      app: {
        vault: {
          adapter: {
            getBasePath() {
              return '/vault';
            },
          },
        },
      },
    },
  };
  const collection = {
    env,
    items: {},
    get_named_context(name) {
      return Object.values(this.items).find((context) => {
        return context.data.name === name;
      });
    },
    get(key) {
      return this.items[key] || null;
    },
    new_context(data) {
      const context = create_context(this, data.key, data.name);
      this.items[data.key] = context;
      return context;
    },
    async process_save_queue() {
      this.processed = true;
    },
  };
  env.smart_contexts = collection;
  return collection;
}

test('Smart Context tool actions list, create, resolve, read, add, and remove', async (t) => {
  const collection = create_collection();
  const alpha = create_context(collection, 'alpha', 'Alpha');
  collection.items.alpha = alpha;

  t.deepEqual(smart_contexts_list.call(collection), {
    total: 1,
    names: ['Alpha'],
  });

  const created = await smart_contexts_create.call(collection, {
    name: 'Project Beta',
  });
  t.true(created.created);
  t.is(created.key, 'project-beta');

  const resolved = context_name_action_scope.resolve({
    env: collection.env,
    params: { name: 'alpha' },
  });
  t.is(resolved, alpha);
  t.deepEqual(context_get.call(alpha), {
    ok: true,
    name: 'Alpha',
    key: 'alpha',
    total: 0,
    items: [],
  });
  t.is(await context_read.call(alpha), '<context>Alpha</context>');

  const added = await context_add.call(alpha, {
    item: '/vault/Notes/Alpha.md',
  });
  t.deepEqual(added.added, ['Notes/Alpha.md']);
  t.true(collection.processed);

  const removed = await context_remove.call(alpha, {
    item: 'Notes/Alpha.md',
  });
  t.deepEqual(removed.removed, ['Notes/Alpha.md']);
});

test('normalize_context_item_key keeps vault paths relative and marks outside paths external', (t) => {
  const collection = create_collection();

  t.is(
    normalize_context_item_key(collection.env, '/vault/Notes/Alpha.md'),
    'Notes/Alpha.md',
  );
  t.is(
    normalize_context_item_key(collection.env, '/repo/src/index.js'),
    'external:../repo/src/index.js',
  );
  t.is(
    normalize_context_item_key(collection.env, '../repo/src/index.js'),
    'external:../repo/src/index.js',
  );
});
