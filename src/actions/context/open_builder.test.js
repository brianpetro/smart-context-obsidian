import test from 'ava';
import {
  context_open_builder,
  menus,
} from './open_builder.js';

test('context_open_builder delegates to the canonical collection Builder', (t) => {
  const calls = [];
  const ctx = {
    collection: {
      open_builder(received_ctx, params) {
        calls.push({ received_ctx, params });
        return true;
      },
    },
  };

  t.true(context_open_builder.call(ctx, {
    menu_ctx: {},
    source_mode: 'context_suggest_sources',
  }));
  t.deepEqual(calls, [{
    received_ctx: ctx,
    params: {
      source_mode: 'context_suggest_sources',
      event_source: 'context_open_builder',
    },
  }]);
});

test('context_open_builder fails closed without the collection Builder', (t) => {
  t.false(context_open_builder.call({}));
});

test('open action hides while the Context Builder is already open', (t) => {
  const menu = menus['smart_context:action_menu'];

  t.true(menu.when.call({ params: {} }));
  t.false(menu.when.call({
    params: { surface: 'context_builder' },
  }));
});
