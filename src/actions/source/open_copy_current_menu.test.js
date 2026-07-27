import test from 'ava';
import {
  action_scope,
  build_copy_menu,
  build_no_current_source_menu,
  get_copy_menu_position,
  get_open_copy_menu_placement_params,
  ribbon_icons,
  show_copy_menu,
} from './open_copy_current_menu.js';

function create_menu() {
  return {
    items: [],
    addItem(callback) {
      const item = {
        title: '',
        icon: '',
        disabled: false,
        on_click: null,
        setTitle(title) {
          this.title = title;
          return this;
        },
        setIcon(icon) {
          this.icon = icon;
          return this;
        },
        setDisabled(disabled) {
          this.disabled = Boolean(disabled);
          return this;
        },
        onClick(on_click) {
          this.on_click = on_click;
          return this;
        },
      };
      callback(item);
      this.items.push(item);
      return this;
    },
    addSeparator() {
      this.items.push({ separator: true });
      return this;
    },
  };
}

test('copy-current ribbon resolves only launcher params', (t) => {
  const click_event = {
    clientX: 12,
    clientY: 34,
  };
  const active_view = {
    file: {
      path: 'Current.md',
    },
    editor: {
      getValue() {
        return '# Current';
      },
    },
  };
  const plugin = {
    app: {
      workspace: {
        getActiveViewOfType() {
          return active_view;
        },
        getActiveFile() {
          return active_view.file;
        },
      },
    },
  };

  const params = get_open_copy_menu_placement_params({
    plugin,
    click_event,
  });

  t.is(params.plugin, plugin);
  t.is(params.source_path, 'Current.md');
  t.is(params.markdown, '# Current');
  t.is(params.click_event, click_event);
  t.false(Object.prototype.hasOwnProperty.call(params, 'mode'));
  t.false(Object.prototype.hasOwnProperty.call(params, 'max_depth'));
  t.false(Object.prototype.hasOwnProperty.call(params, 'with_media'));
});

test('copy-current ribbon belongs to the menu launcher action', (t) => {
  t.deepEqual(action_scope, {
    type: 'collection',
    collection_key: 'smart_sources',
  });

  const spec = ribbon_icons.copy_context;
  t.is(spec.icon_name, 'smart-copy-note');
  t.is(spec.description, 'Smart Context: Copy current');
  t.false(spec.description.toLowerCase().includes('depth'));
  t.is(typeof spec.register_when, 'function');
  t.is(typeof spec.params, 'function');
  t.is(typeof spec.when, 'function');
  t.is(spec.get_scope, undefined);
});

test('copy-current ribbon remains available without a current source', (t) => {
  const app = {};
  const env = {
    obsidian_app: app,
    smart_contexts: {},
    build_menu() {},
  };
  const scope = {
    env,
    get(source_path) {
      return source_path === 'Current.md'
        ? { file_type: 'md' }
        : source_path === 'Unsupported.pdf'
          ? { file_type: 'pdf' }
          : null
      ;
    },
  };
  const spec = ribbon_icons.copy_context;
  const base_ctx = {
    env,
    scope,
    params: {
      plugin: { app },
      allowed_file_types: ['md'],
    },
  };

  t.true(spec.when({
    ...base_ctx,
    params: {
      ...base_ctx.params,
      source_path: '',
    },
  }));
  t.true(spec.when({
    ...base_ctx,
    params: {
      ...base_ctx.params,
      source_path: 'Current.md',
    },
  }));
  t.false(spec.when({
    ...base_ctx,
    params: {
      ...base_ctx.params,
      source_path: 'Unsupported.pdf',
    },
  }));
});

test('build_copy_menu uses the temporary Smart Context as exact depth-menu scope', (t) => {
  const calls = [];
  const menu = {
    items: [],
  };
  const ctx = {
    env: {
      build_menu(menu_key, provided_menu, scope, params) {
        calls.push({
          menu_key,
          provided_menu,
          scope,
          params,
        });
        menu.items.push({ title: 'Depth 0 - current note' });
      },
    },
  };

  t.is(build_copy_menu(ctx, menu), menu);
  t.deepEqual(calls, [
    {
      menu_key: 'smart_context:copy_depth_menu',
      provided_menu: menu,
      scope: ctx,
      params: {},
    },
  ]);
});

test('no-current-source menu explains the disabled copy state and opens Builder', (t) => {
  const calls = [];
  const opened_context = {
    key: 'new-context',
  };
  const env = {
    smart_contexts: {
      actions: {
        smart_contexts_open_new(params) {
          calls.push(params);
          return opened_context;
        },
      },
    },
  };
  const menu = create_menu();

  t.is(build_no_current_source_menu(env, menu, {
    event_source: 'ribbon:smart-context:copy_context',
  }), menu);
  t.deepEqual(menu.items.map((item) => ({
    title: item.title,
    icon: item.icon,
    disabled: item.disabled,
    separator: item.separator === true,
  })), [
    {
      title: 'No source is currently open',
      icon: 'smart-copy-note',
      disabled: true,
      separator: false,
    },
    {
      title: undefined,
      icon: undefined,
      disabled: undefined,
      separator: true,
    },
    {
      title: 'Open Context Builder',
      icon: 'smart-context-builder',
      disabled: false,
      separator: false,
    },
  ]);

  t.is(menu.items[2].on_click(), opened_context);
  t.deepEqual(calls, [
    {
      event_source:
        'ribbon:smart-context:copy_context:open_builder',
    },
  ]);
});

test('copy menu uses pointer coordinates and ribbon geometry fallback', (t) => {
  const calls = [];
  const pointer_event = {
    clientX: 12,
    clientY: 34,
    currentTarget: {
      getBoundingClientRect() {
        return {
          left: 5,
          bottom: 25,
        };
      },
    },
  };
  const menu = {
    showAtMouseEvent(event) {
      calls.push({ type: 'mouse', event });
    },
    showAtPosition(position) {
      calls.push({ type: 'position', position });
    },
  };

  const pointer_position = get_copy_menu_position(pointer_event);
  t.deepEqual(pointer_position, {
    x: 5,
    y: 25,
  });
  t.true(show_copy_menu(menu, pointer_event, pointer_position));
  t.deepEqual(calls, [
    {
      type: 'mouse',
      event: pointer_event,
    },
  ]);

  calls.length = 0;
  const keyboard_click = {
    clientX: 0,
    clientY: 0,
    currentTarget: pointer_event.currentTarget,
  };
  const keyboard_position = get_copy_menu_position(keyboard_click);

  t.true(show_copy_menu(menu, keyboard_click, keyboard_position));
  t.deepEqual(calls, [
    {
      type: 'position',
      position: {
        x: 5,
        y: 25,
      },
    },
  ]);
});
