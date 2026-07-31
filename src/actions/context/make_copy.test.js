import test from 'ava';
import { context_make_copy } from './make_copy.js';

test('make copy opens the configured Builder', (t) => {
  const opened = [];
  const collection = {
    new_context(data) {
      return {
        key: 'copy-key',
        collection,
        data,
        emit_event() {},
      };
    },
    open_builder(ctx, params) {
      opened.push({ ctx, params });
      return true;
    },
  };
  const ctx = {
    collection,
    data: {
      name: 'Shared',
      context_items: {
        'Evidence.md': { key: 'Evidence.md' },
      },
      settings: {
        context_items: {
          headings: {
            Draft: { include: false },
          },
        },
      },
    },
    emit_event() {},
  };

  const copied_ctx = context_make_copy.call(ctx, {
    event_source: 'test.copy',
  });

  t.is(opened.length, 1);
  t.is(opened[0].ctx, copied_ctx);
  t.deepEqual(opened[0].params, {
    event_source: 'test.copy',
  });
  t.is(copied_ctx.data.name, 'Shared copy');
  t.deepEqual(copied_ctx.data.settings, ctx.data.settings);
  t.not(copied_ctx.data.settings, ctx.data.settings);
  t.not(
    copied_ctx.data.settings.context_items.headings,
    ctx.data.settings.context_items.headings,
  );
});
