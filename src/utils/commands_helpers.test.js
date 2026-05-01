import test from 'ava';
import {
  build_copy_current_filter,
  build_current_copy_context,
} from './commands_helpers.js';

class TestSmartContext {
  constructor(env, data = {}) {
    this.env = env;
    this.data = {
      key: '',
      context_items: {},
      exclusions: {},
      ...data,
    };
  }

  get key() {
    return this.data.key;
  }

  get context_items() {
    const ctx = this;
    return {
      filter(predicate) {
        const items = Object.entries(ctx.data.context_items || {})
          .map(([key, item_data]) => ({
            key,
            data: {
              key,
              ...(item_data && typeof item_data === 'object' ? item_data : {}),
            },
          }))
        ;
        return typeof predicate === 'function'
          ? items.filter(predicate)
          : items
        ;
      },
    };
  }
}

function parse_test_codeblock(cb_content = '') {
  const context_items = {};
  const exclusions = {};

  cb_content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (line.startsWith('!')) {
        const key = line.slice(1).trim();
        exclusions[key] = {
          key,
          exclude: true,
        };
        return;
      }

      if (line.startsWith('ctx:: ')) {
        const key = line.slice(6).trim();
        context_items[key] = {
          key,
          named_context: true,
        };
        return;
      }

      context_items[line] = { key: line };
    })
  ;

  return {
    context_items,
    exclusions,
  };
}

function build_plugin() {
  const codeblock_contexts = new Map();
  const env = {
    smart_contexts: {
      get(key) {
        return codeblock_contexts.get(key) || null;
      },
      new_context(data = {}) {
        const ctx = new TestSmartContext(env, data);
        ctx.actions = {
          context_parse_codeblock({ cb_content }) {
            const parsed = parse_test_codeblock(cb_content);
            ctx.data.context_items = parsed.context_items;
            ctx.data.exclusions = parsed.exclusions;
          },
        };
        codeblock_contexts.set(ctx.key, ctx);
        return ctx;
      },
    },
  };

  return {
    env,
    plugin: {
      env,
      app: {},
    },
  };
}

test('build_current_copy_context preserves direct codeblock exclusions even without codeblock items', async (t) => {
  const { env, plugin } = build_plugin();
  const base_ctx = new TestSmartContext(env, {
    key: 'Note.md',
    context_items: {
      'Note.md': { key: 'Note.md', d: 0 },
      'alpha.md': { key: 'alpha.md', d: 1 },
    },
  });
  const source = {
    actions: {
      async source_get_context() {
        return base_ctx;
      },
    },
  };

  const copy_ctx = await build_current_copy_context(plugin, {
    source_path: 'Note.md',
    source,
    markdown: [
      '```ctx',
      '!alpha.md',
      '```',
    ].join('\n'),
  });

  t.truthy(copy_ctx);
  t.not(copy_ctx, base_ctx);
  t.deepEqual(copy_ctx.data.exclusions, {
    'alpha.md': {
      key: 'alpha.md',
      exclude: true,
    },
  });
  t.deepEqual(copy_ctx.data.context_items, {
    'Note.md': {
      key: 'Note.md',
      d: 0,
      base_context: true,
      base_d: 0,
      base_inlink: false,
    },
    'alpha.md': {
      key: 'alpha.md',
      d: 1,
      base_context: true,
      base_d: 1,
      base_inlink: false,
    },
  });
});

test('build_current_copy_context keeps direct exclusions when codeblock also adds named contexts', async (t) => {
  const { env, plugin } = build_plugin();
  const base_ctx = new TestSmartContext(env, {
    key: 'Note.md',
    exclusions: {
      'base-ignore.md': {
        key: 'base-ignore.md',
        exclude: true,
      },
    },
    context_items: {
      'Note.md': { key: 'Note.md', d: 0 },
      'alpha.md': { key: 'alpha.md', d: 1 },
    },
  });
  const source = {
    actions: {
      async source_get_context() {
        return base_ctx;
      },
    },
  };

  const copy_ctx = await build_current_copy_context(plugin, {
    source_path: 'Note.md',
    source,
    markdown: [
      '```ctx',
      'ctx:: Shared',
      '!alpha.md',
      '```',
    ].join('\n'),
  });

  t.truthy(copy_ctx);
  t.not(copy_ctx, base_ctx);
  t.deepEqual(copy_ctx.data.exclusions, {
    'base-ignore.md': {
      key: 'base-ignore.md',
      exclude: true,
    },
    'alpha.md': {
      key: 'alpha.md',
      exclude: true,
    },
  });
  t.deepEqual(copy_ctx.data.context_items.Shared, {
    key: 'Shared',
    named_context: true,
    d: 0,
    inlink: false,
    from_codeblock: true,
    base_context: false,
    base_d: Number.POSITIVE_INFINITY,
    base_inlink: false,
  });
});

test('build_current_copy_context forces explicit codeblock items to depth 0 when base context linked them deeper', async (t) => {
  const { env, plugin } = build_plugin();
  const base_ctx = new TestSmartContext(env, {
    key: '+Outcome/🌐 page/Loop - page.md',
    context_items: {
      '+Outcome/🌐 page/Loop - page.md': {
        key: '+Outcome/🌐 page/Loop - page.md',
        d: 0,
      },
      '+📥 inbox/core-loop-meeting-step.md': {
        key: '+📥 inbox/core-loop-meeting-step.md',
        d: 0,
      },
      '+📥 inbox/core-loop-pkm-basics-step.md': {
        key: '+📥 inbox/core-loop-pkm-basics-step.md',
        d: 0,
      },
      '+Outcome/🧩 messaging/Chat - messaging.md': {
        key: '+Outcome/🧩 messaging/Chat - messaging.md',
        d: 1,
      },
      '+Outcome/🧩 messaging/Connections - messaging.md': {
        key: '+Outcome/🧩 messaging/Connections - messaging.md',
        d: 2,
        inlink: true,
      },
    },
  });
  const source = {
    actions: {
      async source_get_context() {
        return base_ctx;
      },
    },
  };

  const copy_ctx = await build_current_copy_context(plugin, {
    source_path: '+Outcome/🌐 page/Loop - page.md',
    source,
    markdown: [
      '```smart-context',
      '+📥 inbox/core-loop-meeting-step.md',
      '+📥 inbox/core-loop-pkm-basics-step.md',
      '+Outcome/🧩 messaging/Chat - messaging.md',
      '+Outcome/🧩 messaging/Connections - messaging.md',
      '+Outcome/🧩 messaging/Context - messaging.md',
      '+Outcome/🧩 messaging/Lookup - messaging.md',
      '+Outcome/🧩 messaging/Plugins  messaging.md',
      '+Outcome/🧩 messaging/Plugins - Pro messaging.md',
      '+Outcome/🧩 messaging/Smart Loop - messaging.md',
      '```',
    ].join('\n'),
  });

  t.truthy(copy_ctx);
  const chat_item = copy_ctx.data.context_items['+Outcome/🧩 messaging/Chat - messaging.md'];
  const connections_item = copy_ctx.data.context_items['+Outcome/🧩 messaging/Connections - messaging.md'];

  t.is(chat_item.d, 0);
  t.false(chat_item.inlink);
  t.true(chat_item.from_codeblock);
  t.is(chat_item.base_d, 1);

  t.is(connections_item.d, 0);
  t.false(connections_item.inlink);
  t.true(connections_item.from_codeblock);
  t.is(connections_item.base_d, 2);
  t.true(connections_item.base_inlink);

  const depth_0_filter = build_copy_current_filter({ max_depth: 0 });
  const copied_keys = copy_ctx.context_items
    .filter(depth_0_filter)
    .map((item) => item.key)
    .sort()
  ;

  t.deepEqual(copied_keys, [
    '+Outcome/🌐 page/Loop - page.md',
    '+Outcome/🧩 messaging/Chat - messaging.md',
    '+Outcome/🧩 messaging/Connections - messaging.md',
    '+Outcome/🧩 messaging/Context - messaging.md',
    '+Outcome/🧩 messaging/Lookup - messaging.md',
    '+Outcome/🧩 messaging/Plugins  messaging.md',
    '+Outcome/🧩 messaging/Plugins - Pro messaging.md',
    '+Outcome/🧩 messaging/Smart Loop - messaging.md',
    '+📥 inbox/core-loop-meeting-step.md',
    '+📥 inbox/core-loop-pkm-basics-step.md',
  ].sort());
});
