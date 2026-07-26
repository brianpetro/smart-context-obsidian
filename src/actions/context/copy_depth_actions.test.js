import test from 'ava';
import {
  build_copy_context_depth_filter,
  is_copy_context_depth_available,
} from '../../utils/copy_context_depth.js';
import {
  action_scope as copy_at_depth_action_scope,
  context_copy_at_depth,
  menus as copy_at_depth_menus,
} from './copy_at_depth.js';
import {
  context_open_copy_depth_selector,
  menus as depth_selector_menus,
} from './open_copy_depth_selector.js';

const copy_depth_menu_key = 'smart_context:copy_depth_menu';

function build_context(items = []) {
  const ctx = {
    env: {
      config: {
        actions: {},
        modals: {},
      },
    },
    collection: null,
    actions: {},
    context_items: {
      filter(filter) {
        return typeof filter === 'function'
          ? items.filter(filter)
          : [...items]
        ;
      },
    },
  };
  ctx.collection = {
    env: ctx.env,
  };
  return ctx;
}

function build_depth_menu_items(spec, ctx) {
  const items = [];
  const runs = [];
  const menu = {
    addItem(callback) {
      const item = {
        title: '',
        icon: '',
        on_click: null,
        setTitle(title) {
          this.title = title;
          return this;
        },
        setIcon(icon) {
          this.icon = icon;
          return this;
        },
        onClick(on_click) {
          this.on_click = on_click;
          return this;
        },
      };
      callback(item);
      items.push(item);
    },
  };
  const menu_ctx = {
    menu,
    scope: ctx,
    async run(params) {
      runs.push(params);
      return true;
    },
  };

  spec.build.call(menu_ctx);
  return {
    items,
    runs,
  };
}

test('copy-depth availability uses the active text maximum depth', (t) => {
  const ctx = build_context([
    { key: 'root', data: { d: 0 } },
    { key: 'out-1', data: { d: 1 } },
    { key: 'in-3', data: { d: 3, inlink: true } },
    { key: 'excluded-5', data: { d: 5, exclude: true } },
    { key: 'media-5', data: { d: 5 }, is_media: true },
  ]);

  t.true(is_copy_context_depth_available(ctx, 0));
  t.true(is_copy_context_depth_available(ctx, 1));
  t.true(is_copy_context_depth_available(ctx, 2));
  t.true(is_copy_context_depth_available(ctx, 3));
  t.false(is_copy_context_depth_available(ctx, 4));
  t.false(is_copy_context_depth_available(ctx, -1));
  t.false(is_copy_context_depth_available(build_context(), 0));
});

test('Core copy-at-depth action reuses the supplied context and supports depths 0-2', async (t) => {
  const calls = [];
  const ctx = build_context([
    { key: 'root', data: { d: 0 } },
  ]);
  ctx.actions.context_copy_to_clipboard = async (params) => {
    calls.push(params);
    return true;
  };

  const event_source =
    'menu:smart_context:copy_depth_menu:context_copy_at_depth';
  const exclusions = {
    'Excluded.md': {
      key: 'Excluded.md',
    },
  };
  const copied = await context_copy_at_depth.call(ctx, {
    max_depth: 2,
    event_source,
    exclusions,
    filter(item) {
      return item?.key !== 'user-filtered';
    },
    action_key: 'context_copy_at_depth',
    click_args: [],
    click_event: {},
    menu_ctx: {},
    menu_key: copy_depth_menu_key,
  });

  t.true(copied);
  t.is(calls.length, 1);
  t.is(calls[0].event_source, event_source);
  t.is(calls[0].exclusions, exclusions);
  t.is(calls[0].max_depth, 2);
  t.false(calls[0].include_inlinks);
  t.false(calls[0].with_media);
  t.false(Object.prototype.hasOwnProperty.call(calls[0], 'action_key'));
  t.false(Object.prototype.hasOwnProperty.call(calls[0], 'click_args'));
  t.false(Object.prototype.hasOwnProperty.call(calls[0], 'click_event'));
  t.false(Object.prototype.hasOwnProperty.call(calls[0], 'menu_ctx'));
  t.false(Object.prototype.hasOwnProperty.call(calls[0], 'menu_key'));

  const filter = calls[0].filter;
  t.true(filter({ key: 'root', data: { d: 0 } }));
  t.true(filter({ key: 'out-2', data: { d: 2 } }));
  t.false(filter({ key: 'out-3', data: { d: 3 } }));
  t.false(filter({ key: 'in-1', data: { d: 1, inlink: true } }));
  t.false(filter({ key: 'excluded', data: { d: 0, exclude: true } }));
  t.false(filter({ key: 'media', data: { d: 0 }, is_media: true }));
  t.false(filter({ key: 'user-filtered', data: { d: 0 } }));

  await context_copy_at_depth.call(ctx, {
    max_depth: 2,
    include_inlinks: true,
  });
  t.true(calls[1].include_inlinks);
  t.true(calls[1].filter({
    key: 'in-1',
    data: { d: 1, inlink: true },
  }));

  t.false(await context_copy_at_depth.call(ctx, {
    max_depth: 3,
  }));
  t.is(calls.length, 2);
});

test('Core copy-at-depth placement exposes both policies at every depth through 2', async (t) => {
  const ctx = build_context([
    { key: 'root', data: { d: 0 } },
    { key: 'out-1', data: { d: 1 } },
    { key: 'out-2', data: { d: 2 } },
    { key: 'in-3', data: { d: 3, inlink: true } },
  ]);
  const spec = copy_at_depth_menus[copy_depth_menu_key];
  const {
    items,
    runs,
  } = build_depth_menu_items(spec, ctx);

  t.deepEqual(copy_at_depth_action_scope, {
    type: 'item',
    collection_key: 'smart_contexts',
    item_arg: 'context_key',
  });
  t.true(spec.when.call({ scope: ctx }));
  t.deepEqual(
    items.map((item) => item.title),
    [
      'Depth 0 - current note',
      'Depth 1 - outlinks only',
      'Depth 1 - include backlinks',
      'Depth 2 - outlinks only',
      'Depth 2 - include backlinks',
    ],
  );
  t.false(items.some((item) => item.title.startsWith('Depth 3')));

  const depth_2_backlinks = items.find((item) => {
    return item.title === 'Depth 2 - include backlinks';
  });
  t.truthy(depth_2_backlinks);
  t.true(await depth_2_backlinks.on_click());
  t.deepEqual(runs, [
    {
      max_depth: 2,
      include_inlinks: true,
    },
  ]);
});

test('copy-depth filter validates depth and combines a caller filter', (t) => {
  t.throws(
    () => build_copy_context_depth_filter({ max_depth: -1 }),
    { instanceOf: TypeError },
  );

  const filter = build_copy_context_depth_filter({
    max_depth: 1,
    include_inlinks: true,
    filter(item) {
      return item?.key !== 'skip';
    },
  });

  t.true(filter({ key: 'in', data: { d: 1, inlink: true } }));
  t.false(filter({ key: 'deep', data: { d: 2 } }));
  t.false(filter({ key: 'skip', data: { d: 0 } }));
});

test('choose-link-depth depth-menu action opens the configured selector on the exact context', (t) => {
  const opened = [];
  class CopyContextModal {
    constructor(ctx) {
      this.ctx = ctx;
    }

    open() {
      opened.push(this.ctx);
    }
  }

  const ctx = build_context([
    { key: 'root', data: { d: 0 } },
  ]);
  ctx.env.config.modals.copy_context_modal = {
    class: CopyContextModal,
  };

  const spec = depth_selector_menus[copy_depth_menu_key];
  t.is(depth_selector_menus['smart_context:copy_menu'], undefined);
  t.is(spec.title, 'Choose link depth...');
  t.is(spec.order, -1);
  t.true(spec.order < copy_at_depth_menus[copy_depth_menu_key].order);
  t.true(spec.when.call({ scope: ctx }));
  t.true(context_open_copy_depth_selector.call(ctx));
  t.deepEqual(opened, [ctx]);
});

test('copy-at-depth placement composes its configured variants into a submenu', (t) => {
  const calls = [];
  const submenu = {
    items: [],
  };
  const item = {
    title: '',
    icon: '',
    disabled: false,
    setTitle(title) {
      this.title = title;
      return this;
    },
    setIcon(icon) {
      this.icon = icon;
      return this;
    },
    setSubmenu() {
      return submenu;
    },
    setDisabled(disabled) {
      this.disabled = disabled;
      return this;
    },
  };
  const menu = {
    addItem(callback) {
      callback(item);
    },
  };
  const ctx = build_context([
    { key: 'root', data: { d: 0 } },
  ]);
  const params = {
    origin: 'ribbon',
  };
  const env = {
    build_menu(menu_key, supplied_menu, scope, supplied_params) {
      calls.push({
        menu_key,
        menu: supplied_menu,
        scope,
        params: supplied_params,
      });
      supplied_menu.items.push({
        action_key: 'context_copy_at_depth',
      });
    },
  };
  const menu_ctx = {
    env,
    menu,
    scope: ctx,
    params,
  };
  const spec = copy_at_depth_menus['smart_context:copy_menu'];

  t.true(spec.when.call(menu_ctx));
  spec.build.call(menu_ctx);

  t.is(item.title, 'Copy text by depth');
  t.is(item.icon, 'git-branch');
  t.false(item.disabled);
  t.deepEqual(calls, [
    {
      menu_key: copy_depth_menu_key,
      menu: submenu,
      scope: ctx,
      params,
    },
  ]);
});
