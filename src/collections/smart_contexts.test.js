import test from 'ava';
import { merge_env_config } from 'obsidian-smart-env';
import { SmartContexts as BaseSmartContexts } from 'obsidian-smart-env/src/collections/smart_contexts.js';
import smart_contexts, { SmartContexts } from './smart_contexts.js';

test('core SmartContexts wins collection merges over the environment base', (t) => {
  const config = {
    version: '9.0.0',
    collections: {
      smart_contexts: {
        class: BaseSmartContexts,
        version: BaseSmartContexts.version,
      },
    },
  };

  merge_env_config(config, {
    version: '1.0.0',
    collections: {
      smart_contexts: {
        ...smart_contexts,
      },
    },
  });

  t.is(smart_contexts.version, SmartContexts.version);
  t.is(config.collections.smart_contexts.class, SmartContexts);
});

test('open_builder preserves the context_selector compatibility event', (t) => {
  const emitted = [];
  const ctx = {
    emit_event(event_key, payload) {
      emitted.push({ event_key, payload });
    },
  };

  const result = SmartContexts.prototype.open_builder.call({}, ctx, {
    source_mode: 'context_suggest_sources',
  });

  t.true(result);
  t.deepEqual(emitted, [{
    event_key: 'context_selector:open',
    payload: {
      source_mode: 'context_suggest_sources',
    },
  }]);
});

test('open_builder fails closed without an event-capable context', (t) => {
  t.false(SmartContexts.prototype.open_builder.call({}, null));
  t.false(SmartContexts.prototype.open_builder.call({}, {}));
});
