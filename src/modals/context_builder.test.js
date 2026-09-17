import test from 'ava';
import { create_builder_fixture, deferred } from '../test_support/context_builder.js';
import { post_process as compose_builder } from '../components/smart-context/builder.js';
import { ContextBuilderModal } from './context_builder.js';
import { context_suggest_blocks } from 'obsidian-smart-env/src/actions/context-suggest/blocks.js';
import {
  dispose_unmounted_builder,
} from '../components/smart-context/builder.js';

test('Builder source modes use placed suggest actions', (t) => {
  const calls = [];
  const modal = {
    env: {
      config: {
        actions: {
          context_suggest_sources: {
            display_description: 'Search notes.',
          },
        },
      },
    },
    get_suggest_actions(params) {
      calls.push(params);
      return [
        {
          action_key: 'context_suggest_sources',
          title: 'Notes',
          icon: 'file-text',
          run() {},
        },
      ];
    },
  };

  const modes = ContextBuilderModal.prototype.resolve_source_modes.call(modal);

  t.deepEqual(calls, [{ surface: 'context_builder' }]);
  t.deepEqual(modes.map((mode) => mode.action_key), [
    'context_suggest_sources',
  ]);
  t.is(modes[0].label, 'Notes');
  t.is(modes[0].description, 'Search notes.');
  t.is(modes[0].placeholder, 'Search notes...');
});

test('top-level suggestion loading runs the resolved placement action', async (t) => {
  const run_calls = [];
  const source_mode = {
    action_key: 'context_suggest_sources',
    async run(params) {
      run_calls.push(params);
      return [];
    },
  };
  const modal = {
    _request_id: 0,
    _is_closed: false,
    _source_mode_loading: false,
    _set_custom_instructions: false,
    suggestions: null,
    source_modes: [source_mode],
    env: {
      events: {
        emit() {},
      },
    },
    get_source_mode: ContextBuilderModal.prototype.get_source_mode,
    is_request_current: ContextBuilderModal.prototype.is_request_current,
    set_default_instructions() {},
    update_suggestions_view() {},
    refresh_builder_chrome() {},
  };

  const result = await ContextBuilderModal.prototype.update_suggestions.call(
    modal,
    'context_suggest_sources',
  );

  t.deepEqual(result, []);
  t.deepEqual(modal.suggestions, []);
  t.is(run_calls.length, 1);
  t.is(run_calls[0].modal, modal);
  t.is(
    run_calls[0].event_source,
    'context_builder.suggest:context_suggest_sources',
  );
});

test('notes remain the default among explicitly placed source modes', (t) => {
  const modal = {
    source_modes: [
      { action_key: 'context_suggest_external' },
      { action_key: 'context_suggest_sources' },
    ],
    get_source_mode: ContextBuilderModal.prototype.get_source_mode,
  };

  t.is(
    ContextBuilderModal.prototype.resolve_default_source_mode.call(modal),
    'context_suggest_sources',
  );
  t.is(
    ContextBuilderModal.prototype.resolve_default_source_mode.call(
      modal,
      'context_suggest_external',
    ),
    'context_suggest_external',
  );
});

test('closed Builder blocks new suggestion work', async (t) => {
  let update_calls = 0;
  const modal = {
    _is_closed: true,
    _request_id: 4,
    _source_mode_loading: false,
    active_source_mode: 'context_suggest_sources',
    suggestions: null,
    update_suggestions() {
      update_calls += 1;
    },
  };

  t.deepEqual(
    ContextBuilderModal.prototype.get_suggestions.call(modal),
    [],
  );
  t.false(
    ContextBuilderModal.prototype.is_request_current.call(modal, 4),
  );
  t.deepEqual(
    await ContextBuilderModal.prototype.update_suggestions.call(
      modal,
      'context_suggest_sources',
    ),
    [],
  );
  t.is(update_calls, 0);
});

test('late Builder disposal cannot clear a newer chrome refresh callback', (t) => {
  const modal = {
    _builder_chrome_refresh: null,
    set_builder_chrome_refresh:
      ContextBuilderModal.prototype.set_builder_chrome_refresh,
    clear_builder_chrome_refresh:
      ContextBuilderModal.prototype.clear_builder_chrome_refresh,
  };
  const first_refresh = () => {};
  const second_refresh = () => {};

  modal.set_builder_chrome_refresh(first_refresh);
  modal.set_builder_chrome_refresh(second_refresh);
  modal.clear_builder_chrome_refresh(first_refresh);
  t.is(modal._builder_chrome_refresh, second_refresh);

  modal.clear_builder_chrome_refresh(second_refresh);
  t.is(modal._builder_chrome_refresh, null);
});

test('discarded Builder elements get a mounted removal lifecycle', async (t) => {
  let appended = null;
  let removed = 0;
  const attributes = {};
  const builder = {
    dataset: {},
    hidden: false,
    isConnected: false,
    style: {},
    ownerDocument: {
      body: {
        appendChild(element) {
          appended = element;
          element.isConnected = true;
        },
      },
    },
    setAttribute(key, value) {
      attributes[key] = value;
    },
    remove() {
      removed += 1;
      this.isConnected = false;
    },
  };

  dispose_unmounted_builder(builder);

  t.is(appended, builder);
  t.true(builder.hidden);
  t.is(builder.style.display, 'none');
  t.is(builder.dataset.contextBuilderDisposed, 'true');
  t.is(attributes['aria-hidden'], 'true');
  t.is(removed, 0);

  await new Promise((resolve) => setTimeout(resolve, 10));
  t.is(removed, 1);
});

test('rerender disposes the active previous Builder before replacing it', async (t) => {
  let removed = 0;
  const previous_builder = {
    dataset: {},
    isConnected: true,
    remove() {
      removed += 1;
      this.isConnected = false;
    },
  };
  const next_builder = {
    dataset: {},
    isConnected: false,
  };
  const prepended = [];
  const modal = {
    _is_closed: false,
    _render_id: 0,
    _builder_container: previous_builder,
    _builder_chrome_refresh: () => {},
    source_modes: [{ action_key: 'context_suggest_sources' }],
    suggestions: [],
    _source_mode_loading: false,
    active_source_mode: 'context_suggest_sources',
    smart_context: {},
    params: {},
    origin: {},
    modalEl: {
      classList: { add() {} },
      style: {},
      querySelector() { return null; },
      prepend(builder) {
        prepended.push(builder);
      },
    },
    env: {
      smart_components: {
        async render_component() {
          return next_builder;
        },
      },
    },
    update_suggestions() {},
    show_render_error() {
      t.fail('replacement render should not show an error');
    },
  };

  await ContextBuilderModal.prototype.render.call(modal);

  t.is(previous_builder.dataset.contextBuilderDisposed, 'true');
  t.is(removed, 1);
  t.deepEqual(prepended, [next_builder]);
  t.is(modal._builder_container, next_builder);
  t.is(modal._builder_chrome_refresh, null);
});

test('Builder preserves established context_selector transport identity', (t) => {
  t.is(ContextBuilderModal.modal_type, 'context_selector');
  t.is(ContextBuilderModal.event_domain, 'context_selector');
  t.is(ContextBuilderModal.command_id, 'context_selector');
  t.is(ContextBuilderModal.modal_key, 'context_selector');
  t.is(ContextBuilderModal.display_text, 'Context Builder');
});

test('render failures remain on the canonical Builder surface', async (t) => {
  const errors = [];
  const modal = {
    _is_closed: false,
    _render_id: 0,
    _builder_container: null,
    _builder_chrome_refresh: null,
    source_modes: [{ action_key: 'context_suggest_sources' }],
    smart_context: {},
    params: {},
    origin: {},
    modalEl: {
      classList: { add() {} },
      style: {},
      querySelector() { return null; },
    },
    env: {
      smart_components: {
        async render_component() {
          throw new Error('render failed');
        },
      },
    },
    show_render_error(error) {
      errors.push(error);
    },
  };

  await ContextBuilderModal.prototype.render.call(modal);

  t.is(errors.length, 1);
  t.is(errors[0].message, 'render failed');
});

test('a late Builder render cannot replace the current modal content', async (t) => {
  const deferred = [];
  const prepended = [];
  const create_deferred = () => {
    let resolve;
    const promise = new Promise((next_resolve) => {
      resolve = next_resolve;
    });
    return { promise, resolve };
  };
  const first = create_deferred();
  const second = create_deferred();
  deferred.push(first, second);

  const modal = {
    _is_closed: false,
    _render_id: 0,
    _builder_container: null,
    _builder_chrome_refresh: null,
    source_modes: [{ action_key: 'context_suggest_sources' }],
    suggestions: [],
    _source_mode_loading: false,
    active_source_mode: 'context_suggest_sources',
    smart_context: {},
    params: {},
    modalEl: {
      classList: { add() {} },
      style: {},
      querySelector() { return null; },
      prepend(builder) {
        prepended.push(builder);
      },
    },
    env: {
      smart_components: {
        render_component() {
          return deferred.shift().promise;
        },
      },
    },
    show_render_error() {
      t.fail('stale renders must not show an error');
    },
    update_suggestions() {},
    origin: {},
  };
  const first_builder = {
    dataset: {},
    removed: false,
    remove() { this.removed = true; },
  };
  const second_builder = {
    dataset: {},
    removed: false,
    remove() { this.removed = true; },
  };

  const first_render = ContextBuilderModal.prototype.render.call(modal);
  const second_render = ContextBuilderModal.prototype.render.call(modal);

  second.resolve(second_builder);
  await second_render;
  first.resolve(first_builder);
  await first_render;

  t.deepEqual(prepended, [second_builder]);
  t.true(first_builder.removed);
  t.false(second_builder.removed);
  t.is(modal._builder_container, second_builder);
});

test('Builder routes plain a-z input to fuzzy search at the current selection', (t) => {
  const dispatched_events = [];
  const input = {
    value: 'ab',
    selectionStart: 1,
    selectionEnd: 2,
    focus_called: false,
    focus() {
      this.focus_called = true;
    },
    setRangeText(text, start, end, selection_mode) {
      this.value = `${this.value.slice(0, start)}${text}${this.value.slice(end)}`;
      this.selectionStart = start + text.length;
      this.selectionEnd = this.selectionStart;
      t.is(selection_mode, 'end');
    },
    dispatchEvent(event) {
      dispatched_events.push(event);
    },
  };
  const modal = {
    inputEl: input,
    focus_search: ContextBuilderModal.prototype.focus_search,
  };
  let prevented = false;

  const result = ContextBuilderModal.prototype.handle_alpha_keydown.call(modal, {
    key: 'Z',
    target: {},
    preventDefault() {
      prevented = true;
    },
  });

  t.false(result);
  t.true(prevented);
  t.true(input.focus_called);
  t.is(input.value, 'aZ');
  t.is(input.selectionStart, 2);
  t.is(input.selectionEnd, 2);
  t.is(dispatched_events.length, 1);
  t.is(dispatched_events[0].type, 'input');
  t.true(dispatched_events[0].bubbles);
});

test('Builder leaves name input, fuzzy input, shortcuts, and non-letters unchanged', (t) => {
  const input = {
    value: 'query',
    selectionStart: 5,
    selectionEnd: 5,
    focus() {
      t.fail('ignored keys must not refocus fuzzy search');
    },
    setRangeText() {
      t.fail('ignored keys must not change fuzzy search');
    },
    dispatchEvent() {
      t.fail('ignored keys must not refresh fuzzy suggestions');
    },
  };
  const modal = {
    inputEl: input,
    focus_search: ContextBuilderModal.prototype.focus_search,
  };
  let prevented_count = 0;
  const name_input = {
    classList: {
      contains(class_name) {
        return class_name === 'sc-context-name-input';
      },
    },
  };
  const ignored_events = [
    { key: 'a', target: name_input },
    { key: 'a', target: input },
    { key: 'a', target: {}, ctrlKey: true },
    { key: 'a', target: {}, metaKey: true },
    { key: 'a', target: {}, altKey: true },
    { key: '1', target: {} },
  ];

  ignored_events.forEach((event) => {
    const result = ContextBuilderModal.prototype.handle_alpha_keydown.call(modal, {
      ...event,
      preventDefault() {
        prevented_count += 1;
      },
    });
    t.is(result, undefined);
  });

  t.is(prevented_count, 0);
  t.is(input.value, 'query');
});

test.serial('Sections back-navigation updates the Builder mode and runs the placed Notes action', async (t) => {
  const previous_window = globalThis.window;
  globalThis.window = { setTimeout: (callback) => callback() };
  t.teardown(() => {
    if (previous_window === undefined) delete globalThis.window;
    else globalThis.window = previous_window;
  });

  const notes = [{ key: 'notes/a.md' }];
  const run_calls = [];
  const refreshed_modes = [];
  const modal = {
    _request_id: 0,
    _is_closed: false,
    _source_mode_loading: false,
    active_source_mode: 'context_suggest_blocks',
    last_input_value: 'section',
    inputEl: { value: 'section', placeholder: '' },
    suggestions: [],
    source_modes: [{
      action_key: 'context_suggest_sources',
      placeholder: 'Search notes...',
      async run(params) {
        run_calls.push(params);
        return notes;
      },
    }],
    env: { events: { emit: () => t.fail('Back-navigation must not emit an error') } },
    get_source_mode: ContextBuilderModal.prototype.get_source_mode,
    is_request_current: ContextBuilderModal.prototype.is_request_current,
    set_active_source_mode: ContextBuilderModal.prototype.set_active_source_mode,
    update_suggestions: ContextBuilderModal.prototype.update_suggestions,
    apply_active_source_mode_copy() {
      this.inputEl.placeholder = this.get_source_mode(this.active_source_mode).placeholder;
    },
    refresh_builder_chrome() {
      refreshed_modes.push(this.active_source_mode);
    },
    set_default_instructions() {},
    update_suggestions_view() {},
    focus_search() {},
  };
  const ctx = {
    env: {
      smart_blocks: { items: { first: { key: 'notes/a.md#First', lines: [1, 9] } } },
    },
  };
  const [suggestion] = context_suggest_blocks.call(ctx);

  const result = await ContextBuilderModal.prototype.handle_choose_action.call(
    modal,
    suggestion,
    'arrow_left_action',
  );

  t.is(result, notes);
  t.is(modal.suggestions, notes);
  t.is(modal.active_source_mode, 'context_suggest_sources');
  t.is(modal.inputEl.value, '');
  t.is(modal.inputEl.placeholder, 'Search notes...');
  t.is(modal.last_input_value, null);
  t.is(run_calls.length, 1);
  t.is(run_calls[0].modal, modal);
  t.is(run_calls[0].event_source, 'context_builder.suggest:context_suggest_sources');
  t.true(refreshed_modes.length > 0);
  t.true(refreshed_modes.every((mode) => mode === 'context_suggest_sources'));
  t.false(modal._source_mode_loading);
});

test('source handoff waits for the review view, then closes before opening the source', async (t) => {
  const pending = deferred();
  const calls = [];
  const item = {}, event = { ctrlKey: true };
  const modal = {
    _is_closed: false,
    smart_context: { actions: { context_open_builder_view(params) { calls.push(['view', params]); return pending.promise; } } },
    close() { this._is_closed = true; calls.push('close'); },
  };
  const opening = ContextBuilderModal.prototype.open_item.call(modal, item, event);
  t.false(modal._is_closed);
  t.false(await ContextBuilderModal.prototype.open_item.call(modal, item, event));
  pending.resolve({ async open_item(received_item, received_event) { calls.push(['source', received_item, received_event]); } });
  t.true(await opening);
  t.deepEqual(calls, [['view', { active: false }], 'close', ['source', item, event]]);
  t.false(modal._opening_item);
});

test('failed or cancelled review handoff leaves an open modal available for retry', async (t) => {
  const modal = {
    _is_closed: false,
    smart_context: { actions: { async context_open_builder_view() { throw new Error('view failed'); } } },
    close() { t.fail('failed handoff must not close the modal'); },
  };
  await t.throwsAsync(() => ContextBuilderModal.prototype.open_item.call(modal, {}, {}), { message: 'view failed' });
  t.false(modal._opening_item);
  t.false(modal._is_closed);
  modal.smart_context.actions.context_open_builder_view = async () => null;
  t.false(await ContextBuilderModal.prototype.open_item.call(modal, {}, {}));
  t.false(modal._opening_item);
});

test('closing the modal while the review opens prevents late source navigation', async (t) => {
  const pending = deferred();
  const modal = {
    _is_closed: false,
    smart_context: { actions: { context_open_builder_view() { return pending.promise; } } },
    close() { t.fail('already closed modal must not close again'); },
  };
  const opening = ContextBuilderModal.prototype.open_item.call(modal, {}, {});
  modal._is_closed = true;
  pending.resolve({ open_item() { t.fail('late source navigation'); } });
  t.false(await opening);
  t.false(modal._opening_item);
});

test.serial('real modal-to-view handoff retains the pending-removal mask and the original Context', async (t) => {
  const fixture = create_builder_fixture(t, { data: { context_items: { 'a.md': { key: 'a.md' }, 'b.md': { key: 'b.md' } } } });
  const modal = Object.assign(Object.create(ContextBuilderModal.prototype), {
    env: fixture.env, smart_context: fixture.ctx, item_or_collection: fixture.ctx,
    _is_closed: false, _request_id: 0, _render_id: 0,
    origin: { kind: 'preselected', seeded_keys: [] },
    source_modes: [{ action_key: 'context_suggest_sources', label: 'Notes', icon: 'file' }],
    active_source_mode: 'context_suggest_sources',
    close() { this.onClose(); },
  });
  const builder = fixture.builder_element();
  fixture.doc.body.appendChild(builder);
  modal._builder_container = builder;
  await compose_builder.call(fixture.smart_view, fixture.ctx, builder, {
    modal, on_open_item: (item, event) => modal.open_item(item, event),
  });
  const tree = builder.querySelectorAll('.sc-context-builder-tree').find((element) => element.listeners.has('click'));
  const remove_button = tree.querySelectorAll('.sc-context-builder-tree-remove').find((button) => button.dataset.path === 'b.md');
  await tree.dispatch('click', { target: remove_button });
  t.truthy(fixture.ctx.data.context_items['b.md']);
  const item = fixture.ctx.context_items.filter()[0];
  const event = { shiftKey: true };
  t.true(await modal.open_item(item, event));
  const view = fixture.leaves.find((leaf) => leaf.view)?.view;
  t.is(view.smart_context, fixture.ctx);
  t.true(modal._is_closed);
  t.false(builder.isConnected);
  t.truthy(fixture.ctx.data.context_items['b.md']);
  t.deepEqual(view.builder.querySelectorAll('.sc-context-builder-tree-row').map((row) => row.dataset.path), ['a.md']);
  t.deepEqual(fixture.calls.filter((call) => call[0] === 'source'), [['source', 'a.md', event]]);
  await fixture.frame();
  t.deepEqual(Object.keys(fixture.ctx.data.context_items), ['a.md']);
  t.deepEqual(view.builder.querySelectorAll('.sc-context-builder-tree-row').map((row) => row.dataset.path), ['a.md']);
  t.is(fixture.calls.filter((call) => call[0] === 'save_context').length, 1);
});
