import test from 'ava';
import {
  get_context_description_input_value,
  get_context_name_input_value,
  persist_context_description,
  persist_context_name,
  resolve_name_status,
} from './actions_utils.js';

test('get_context_description_input_value normalizes stored descriptions', (t) => {
  const ctx = { data: { description: '  Project evidence  ' } };
  t.is(get_context_description_input_value(ctx), 'Project evidence');
});

test('persist_context_description uses the registered update action', async (t) => {
  const requests = [];
  const ctx = {
    data: { description: 'Old description' },
    actions: {
      async context_update(params) {
        requests.push(params);
        ctx.data.description = params.description;
        return { updated: ['description'] };
      },
    },
  };

  await persist_context_description(ctx, {
    input_value: '  New description  ',
    event_source: 'test.description',
  });

  t.deepEqual(requests, [{
    description: 'New description',
    event_source: 'test.description',
  }]);
});

test('persist_context_description falls back to SmartContext data', async (t) => {
  const events = [];
  const ctx = {
    data: { description: '' },
    queue_save() {
      this.queued = true;
    },
    emit_event(event_key, payload) {
      events.push({ event_key, payload });
    },
  };

  await persist_context_description(ctx, {
    input_value: 'Reference workspace',
    event_source: 'test.description',
  });

  t.true(ctx.queued);
  t.is(ctx.data.description, 'Reference workspace');
  t.deepEqual(events, [{
    event_key: 'context:updated',
    payload: {
      description: 'Reference workspace',
      updated: ['description'],
      event_source: 'test.description',
    },
  }]);
});

test('persist_context_description skips unchanged values', async (t) => {
  let called = false;
  const ctx = {
    data: { description: 'Reference workspace' },
    actions: {
      context_update() {
        called = true;
      },
    },
  };

  await persist_context_description(ctx, {
    input_value: '  Reference workspace  ',
  });

  t.false(called);
});

test('resolve_name_status hides label when name is empty', (t) => {
  const ctx = { data: { name: '' } };
  const result = resolve_name_status(ctx, { input_value: '' });
  t.false(result.is_saved);
  t.is(result.label, '');
});

test('resolve_name_status returns saved label when input matches name', (t) => {
  const ctx = { data: { name: 'Project Alpha' } };
  const result = resolve_name_status(ctx, { input_value: 'Project Alpha' });
  t.true(result.is_saved);
  t.is(result.label, 'Saved');
});

test('resolve_name_status hides label when input differs from name', (t) => {
  const ctx = { data: { name: 'Project Alpha' } };
  const result = resolve_name_status(ctx, { input_value: 'Project Beta' });
  t.false(result.is_saved);
  t.is(result.label, '');
});