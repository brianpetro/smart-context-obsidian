import test from 'ava';
import { ContextBuilderModal } from './context_builder.js';
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
