import test from 'ava';
import { SmartContext } from 'smart-contexts/smart_context.js';
import {
  get_named_context_rules,
  remove_named_context_rule,
} from './rules_list.js';

test('get_named_context_rules returns direct named-context rules', (t) => {
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
    remove_calls: [],
    save_count: 0,
    remove_item(key, params) {
      this.remove_calls.push({ key, params });
      return SmartContext.prototype.remove_item.call(this, key, params);
    },
    queue_save() {
      this.save_queued = true;
      this.save_count += 1;
    },
    emit_event(event_key, payload) {
      emitted.push({ event_key, payload });
    },
  };

  t.true(remove_named_context_rule(ctx, 'Alpha'));
  t.false(Object.prototype.hasOwnProperty.call(ctx.data.context_items, 'Alpha'));
  t.true(ctx.save_queued);
  t.is(ctx.save_count, 1);
  t.deepEqual(ctx.remove_calls, [{ key: 'Alpha', params: { emit_updated: false } }]);
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
  t.false(remove_named_context_rule(ctx, 'Alpha'));
  t.is(ctx.remove_calls.length, 1);
  t.is(ctx.save_count, 1);
  t.is(emitted.length, 1);
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

test('remove_named_context_rule uses the storage key without deleting descendants or exclusions', (t) => {
  const exclusion = { key: 'Stored', exclude: true };
  const calls = [];
  const ctx = {
    data: {
      context_items: {
        Stored: { key: 'Display name', named_context: true },
        'Stored/note.md': { key: 'Stored/note.md' },
      },
      exclusions: { Stored: exclusion },
    },
    queue_save() {},
    remove_item(key, params) {
      calls.push({ key, params });
      return SmartContext.prototype.remove_item.call(this, key, params);
    },
  };

  t.true(remove_named_context_rule(ctx, 'Stored'));
  t.deepEqual(calls, [{ key: 'Stored', params: { emit_updated: false } }]);
  t.false('Stored' in ctx.data.context_items);
  t.true('Stored/note.md' in ctx.data.context_items);
  t.is(ctx.data.exclusions.Stored, exclusion);
  t.false(remove_named_context_rule(ctx, 'missing'));
  t.false(remove_named_context_rule(ctx, ''));
  t.is(calls.length, 1);
});
