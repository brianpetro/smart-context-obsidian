import test from 'ava';
import { context_convert_to_named } from './convert_to_named.js';

function create_context() {
  const opened = [];
  const collection = {
    items: {},
    new_context() {
      return {
        key: 'named-key',
        collection,
        data: {
          context_items: {},
        },
        get name() {
          return this.data.name;
        },
        set name(name) {
          this.data.name = name;
        },
        emit_event() {},
      };
    },
    open_builder(ctx, params) {
      opened.push({ ctx, params });
      return true;
    },
  };
  const ctx = {
    key: 'Current.md',
    collection,
    data: {
      context_items: {
        'Evidence.md': { key: 'Evidence.md' },
      },
    },
    named_contexts: [],
    emit_event() {},
  };
  return { ctx, opened };
}

test('convert to named opens the configured Builder', (t) => {
  const { ctx, opened } = create_context();

  const named_ctx = context_convert_to_named.call(ctx, {
    context_name: 'Shared',
    event_source: 'test.convert',
  });

  t.is(opened.length, 1);
  t.is(opened[0].ctx, named_ctx);
  t.deepEqual(opened[0].params, {
    event_source: 'test.convert',
  });
  t.deepEqual(ctx.data.context_items, {
    Shared: {
      key: 'Shared',
      kind: 'named_context',
      named_context: true,
    },
  });
});
