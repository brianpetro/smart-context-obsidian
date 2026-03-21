import test from 'ava';
import {
  get_context_name_input_value,
  persist_context_name,
  resolve_name_status,
} from './actions_utils.js';

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

test('get_context_name_input_value prefers linked named context for codeblock ctx', (t) => {
  const ctx = {
    key: 'Project/Hub.md#codeblock',
    data: {
      name: 'Legacy direct name',
      codeblock_named_contexts: ['Backend notes'],
    },
  };

  t.is(get_context_name_input_value(ctx), 'Backend notes');
});

test('resolve_name_status uses linked named context for codeblock ctx', (t) => {
  const ctx = {
    key: 'Project/Hub.md#codeblock',
    data: {
      codeblock_named_contexts: ['Backend notes'],
    },
  };

  const result = resolve_name_status(ctx, { input_value: 'Backend notes' });

  t.true(result.is_saved);
  t.is(result.label, 'Saved');
});

test('persist_context_name renames linked named context from codeblock builder input', (t) => {
  const named_ctx = {
    data: {
      name: 'Backend notes',
    },
    rename_log: [],
  };

  Object.defineProperty(named_ctx, 'name', {
    configurable: true,
    get() {
      return this.data.name;
    },
    set(value) {
      this.rename_log.push({
        old_name: this.data.name,
        name: value,
      });
      this.data.name = value;
    },
  });

  const ctx = {
    key: 'Project/Hub.md#codeblock',
    data: {
      codeblock_named_contexts: ['Backend notes'],
      context_items: {
        'Project/API.md': {
          from_named_context: 'Backend notes',
        },
      },
    },
    env: {
      smart_contexts: {
        get() {
          return null;
        },
        filter(predicate) {
          return [named_ctx].filter(predicate);
        },
      },
    },
  };

  const result = persist_context_name(ctx, {
    input_value: 'Renamed notes',
    open_selector: false,
  });

  t.true(result.changed);
  t.is(result.action, 'renamed');
  t.is(result.context_name, 'Renamed notes');
  t.is(named_ctx.data.name, 'Renamed notes');
  t.deepEqual(named_ctx.rename_log, [{
    old_name: 'Backend notes',
    name: 'Renamed notes',
  }]);
  t.deepEqual(ctx.data.codeblock_named_contexts, ['Renamed notes']);
  t.is(ctx.data.context_items['Project/API.md'].from_named_context, 'Renamed notes');
});

test('persist_context_name converts unnamed codeblock ctx using named-context flow', (t) => {
  const created_named_contexts = [];

  const smart_contexts = {
    items: {},
    get() {
      return null;
    },
    filter() {
      return [];
    },
    new_context() {
      const named_ctx = {
        key: `named-${created_named_contexts.length + 1}`,
        data: {
          key: `named-${created_named_contexts.length + 1}`,
          context_items: {},
          name: '',
        },
        added_items: [],
        queue_save() {},
        emit_event() {},
        on_event() {
          return () => {};
        },
        add_items(items) {
          this.added_items.push(...items);
          items.forEach((item) => {
            this.data.context_items[item.key] = item;
          });
        },
      };

      Object.defineProperty(named_ctx, 'name', {
        configurable: true,
        get() {
          return this.data.name;
        },
        set(value) {
          this.data.name = value;
        },
      });

      created_named_contexts.push(named_ctx);
      this.items[named_ctx.key] = named_ctx;
      return named_ctx;
    },
  };

  const ctx = {
    key: 'Project/Hub.md#codeblock',
    data: {
      name: 'Legacy direct name',
      context_items: {
        'Project/API.md': {
          key: 'Project/API.md',
          d: 0,
        },
      },
      codeblock_named_contexts: [],
      codeblock_passthrough_lines: ['../repo/src'],
    },
    env: {
      smart_contexts,
    },
    added_items: [],
    queue_save() {},
    emit_event() {},
    on_event() {
      return () => {};
    },
    add_items(items) {
      this.added_items.push(...items);
      items.forEach((item) => {
        this.data.context_items[item.key] = item;
      });
    },
  };

  const result = persist_context_name(ctx, {
    input_value: 'Backend notes',
    open_selector: false,
  });

  t.true(result.changed);
  t.is(result.action, 'converted');
  t.is(created_named_contexts.length, 1);
  t.is(created_named_contexts[0].data.name, 'Backend notes');
  t.deepEqual(ctx.data.codeblock_named_contexts, ['Backend notes']);
  t.false(Object.prototype.hasOwnProperty.call(ctx.data, 'name'));
  t.true(ctx.added_items.every((item) => item.from_named_context === 'Backend notes'));
});
