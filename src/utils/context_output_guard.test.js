import test from 'ava';
import {
  confirm_truncated_context,
  get_context_output_limit_error,
  get_context_output_size,
  get_truncated_context_selections,
  get_zip_limits,
  ZIP_EXPORT_MAX_ITEMS,
  ZIP_EXPORT_MAX_BYTES,
} from './context_output_guard.js';

test('context output size uses resolved item sizes', (t) => {
  t.deepEqual(
    get_context_output_size([
      { size: 100 },
      { data: { size: 50 } },
      { size: null },
    ]),
    {
      item_count: 3,
      total_size: 150,
    },
  );
});

test('context output limits fail closed on item or byte caps', (t) => {
  const items = [
    { size: 60 },
    { size: 60 },
  ];

  t.truthy(get_context_output_limit_error(items, {
    max_items: 1,
    max_bytes: 1000,
    output_label: 'Media copy',
  }));
  t.truthy(get_context_output_limit_error(items, {
    max_items: 10,
    max_bytes: 100,
    output_label: 'Media copy',
  }));
  t.is(get_context_output_limit_error(items, {
    max_items: 10,
    max_bytes: 1000,
  }), null);
});

test('truncated selections require explicit acknowledgement', async (t) => {
  const emitted = [];
  const ctx = {
    data: {
      context_items: {
        'external:../repo': {
          key: 'external:../repo',
          folder: true,
          truncated: true,
          truncated_max_items: 1000,
        },
      },
    },
    emit_event(event_key, payload) {
      emitted.push({ event_key, payload });
    },
  };

  t.deepEqual(get_truncated_context_selections(ctx), [{
    key: 'external:../repo',
    max_items: 1000,
  }]);
  t.false(await confirm_truncated_context(ctx, {
    confirm_truncated: async () => false,
    action_label: 'copy it',
  }));
  t.is(emitted[0].event_key, 'context:truncated_output_blocked');

  t.true(await confirm_truncated_context(ctx, {
    confirm_truncated: () => true,
  }));
  t.true(await confirm_truncated_context(ctx, {
    allow_truncated: true,
  }));
});

test('truncated selection discovery includes nested named contexts without cycles', (t) => {
  const contexts = new Map();
  const env = {
    smart_contexts: {
      get_named_context(name) {
        return contexts.get(name) || null;
      },
    },
  };
  const shared = {
    env,
    data: {
      name: 'Shared',
      context_items: {
        'external:../repo': {
          key: 'external:../repo',
          folder: true,
          truncated: true,
          truncated_max_items: 1000,
        },
        Nested: {
          key: 'Nested',
          named_context: true,
        },
      },
    },
  };
  const nested = {
    env,
    data: {
      name: 'Nested',
      context_items: {
        Shared: {
          key: 'Shared',
          named_context: true,
        },
      },
    },
  };
  contexts.set('Shared', shared);
  contexts.set('Nested', nested);
  const ctx = {
    env,
    data: {
      context_items: {
        Shared: {
          key: 'Shared',
          named_context: true,
        },
      },
    },
  };

  t.deepEqual(get_truncated_context_selections(ctx), [{
    key: 'external:../repo',
    max_items: 1000,
  }]);
});

test('ZIP limits share defaults when Context settings or either setting are unavailable', t => {
  const defaults = { max_zip_items: ZIP_EXPORT_MAX_ITEMS, max_zip_bytes: ZIP_EXPORT_MAX_BYTES };
  for (const ctx of [undefined, null, {}, { settings: {} }, { settings: { actions: {} } }]) {
    t.deepEqual(get_zip_limits(ctx), defaults);
  }
  t.deepEqual(get_zip_limits({ settings: { actions: { context_export_zip: { max_zip_items: 5000 } } } }), {
    ...defaults, max_zip_items: 5000,
  });
  t.deepEqual(get_zip_limits({ settings: { actions: { context_export_zip: { max_zip_size_mb: 128 } } } }), {
    ...defaults, max_zip_bytes: 128 * 1024 * 1024,
  });
});

test('ZIP size settings convert binary MB to bytes and preserve fractional MB', t => {
  const settings = { actions: { context_export_zip: { max_zip_items: 3000.9, max_zip_size_mb: 128.25 } } };
  t.deepEqual(get_zip_limits({ settings }), {
    max_zip_items: 3000,
    max_zip_bytes: 128.25 * 1024 * 1024,
  });
  t.is(settings.actions.context_export_zip.max_zip_items, 3000.9);
  t.is(settings.actions.context_export_zip.max_zip_size_mb, 128.25);
});

test('invalid ZIP size settings fall back instead of disabling the byte guard', t => {
  for (const value of [undefined, null, NaN, Infinity, -Infinity, Number.MAX_VALUE, 0, -1, 0.5, '', '128', true, {}]) {
    const ctx = { settings: { actions: { context_export_zip: { max_zip_items: 4000, max_zip_size_mb: value } } } };
    t.deepEqual(get_zip_limits(ctx), { max_zip_items: 4000, max_zip_bytes: ZIP_EXPORT_MAX_BYTES });
  }
});

test('explicit ZIP byte limits override saved MB without changing settings', t => {
  const settings = { actions: { context_export_zip: { max_zip_items: 2, max_zip_size_mb: 128 } } };
  for (const [value, expected] of [[1.9, 1], [0, 1], [-2, 1], [NaN, 128 * 1024 * 1024], [Infinity, 128 * 1024 * 1024], ['10', 128 * 1024 * 1024]]) {
    t.deepEqual(get_zip_limits({ settings }, { max_zip_items: 3, max_zip_bytes: value }), {
      max_zip_items: 3, max_zip_bytes: expected,
    });
  }
  t.deepEqual(settings.actions.context_export_zip, { max_zip_items: 2, max_zip_size_mb: 128 });
});
