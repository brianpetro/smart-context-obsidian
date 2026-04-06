import test from 'ava';
import { build_current_copy_context } from './commands_helpers.js';

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
    from_codeblock: true,
    base_context: false,
    base_d: Number.POSITIVE_INFINITY,
    base_inlink: false,
  });
});
