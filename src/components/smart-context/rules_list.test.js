import test from 'ava';
import {
  get_named_context_rules,
  remove_named_context_rule,
} from './rules_list.js';

test('get_named_context_rules returns only active direct named-context rules', (t) => {
  const ctx = {
    data: {
      context_items: {
        Alpha: {
          key: 'Alpha',
          named_context: true,
        },
        Beta: {
          key: 'Beta',
          named_context: true,
          exclude: true,
        },
        'note.md': {
          key: 'note.md',
        },
      },
    },
  };

  t.deepEqual(get_named_context_rules(ctx), [{
    storage_key: 'Alpha',
    name: 'Alpha',
  }]);
});

test('remove_named_context_rule removes the stored rule and emits one update', (t) => {
  const emitted = [];
  const ctx = {
    data: {
      context_items: {
        Alpha: {
          key: 'Alpha',
          named_context: true,
        },
        'note.md': {
          key: 'note.md',
        },
      },
    },
    queue_save() {
      this.save_queued = true;
    },
    emit_event(event_key, payload) {
      emitted.push({ event_key, payload });
    },
  };

  t.true(remove_named_context_rule(ctx, 'Alpha'));
  t.false(Object.prototype.hasOwnProperty.call(ctx.data.context_items, 'Alpha'));
  t.true(ctx.save_queued);
  t.deepEqual(emitted, [{
    event_key: 'context:updated',
    payload: {
      removed_key: 'Alpha',
      removed_keys: ['Alpha'],
      removed_inclusion: 'Alpha',
      event_source: 'context_rules.remove_named_context',
    },
  }]);
  t.true(Object.prototype.hasOwnProperty.call(ctx.data.context_items, 'note.md'));
});

test('remove_named_context_rule does not remove a direct source', (t) => {
  const ctx = {
    data: {
      context_items: {
        'note.md': {
          key: 'note.md',
        },
      },
    },
  };

  t.false(remove_named_context_rule(ctx, 'note.md'));
  t.true(Object.prototype.hasOwnProperty.call(ctx.data.context_items, 'note.md'));
});
