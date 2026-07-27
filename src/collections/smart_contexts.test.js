import test from 'ava';
import { SmartContexts } from './smart_contexts.js';

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
