import test from 'ava';
import {
  action_scope,
  build_copy_menu,
  get_copy_menu_position,
  get_open_copy_menu_placement_params,
  ribbon_icons,
  show_copy_menu,
} from './open_copy_current_menu.js';

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
    type: 'item',
    collection_key: 'smart_sources',
    item_arg: 'source_path',
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
