import { Menu } from 'obsidian';
import {
  build_current_copy_context,
  is_copy_current_supported_source,
} from '../../utils/commands_helpers.js';
import {
  get_copy_current_placement_params,
} from './copy_current.js';

const COPY_DEPTH_MENU_KEY = 'smart_context:copy_depth_menu';

export const display_name = 'Open current copy menu';

export const action_scope = {
  type: 'item',
  collection_key: 'smart_sources',
  item_arg: 'source_path',
};

/**
 * Resolve current-source params for the copy-menu ribbon placement.
 *
 * @param {object} ribbon_ctx
 * @param {object} [params={}]
 * @returns {object}
 */
export function get_open_copy_menu_placement_params(
  ribbon_ctx,
  params = {},
) {
  const current_params = get_copy_current_placement_params(
    ribbon_ctx,
    params,
  );

  return {
    plugin: current_params.plugin,
    source_path: current_params.source_path,
    allowed_file_types: current_params.allowed_file_types,
    markdown: current_params.markdown,
    click_event: ribbon_ctx.click_event,
  };
}

/**
 * Capture a stable menu position before asynchronous context construction.
 *
 * @param {MouseEvent|KeyboardEvent|object} click_event
 * @returns {{x:number, y:number}|null}
 */
export function get_copy_menu_position(click_event) {
  const rect = click_event?.currentTarget?.getBoundingClientRect?.();
  if (
    Number.isFinite(rect?.left)
    && Number.isFinite(rect?.bottom)
  ) {
    return {
      x: rect.left,
      y: rect.bottom,
    };
  }

  if (
    Number.isFinite(click_event?.clientX)
    && Number.isFinite(click_event?.clientY)
  ) {
    return {
      x: click_event.clientX,
      y: click_event.clientY,
    };
  }

  return null;
}

/**
 * Build configured copy-depth actions for a Smart Context.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {Menu|object} menu
 * @returns {Menu|object}
 */
export function build_copy_menu(ctx, menu) {
  if (!ctx || !menu || typeof ctx.env?.build_menu !== 'function') {
    return menu;
  }

  ctx.env.build_menu(
    COPY_DEPTH_MENU_KEY,
    menu,
    ctx,
    {},
  );

  return menu;
}

/**
 * Show a built copy menu at the pointer or captured ribbon position.
 *
 * @param {Menu|object} menu
 * @param {MouseEvent|KeyboardEvent|object} click_event
 * @param {{x:number, y:number}|null} menu_position
 * @returns {boolean}
 */
export function show_copy_menu(
  menu,
  click_event,
  menu_position,
) {
  if (!menu) return false;

  const has_pointer_position =
    Number.isFinite(click_event?.clientX)
    && Number.isFinite(click_event?.clientY)
    && (
      click_event.clientX !== 0
      || click_event.clientY !== 0
    )
  ;

  if (
    has_pointer_position
    && typeof menu.showAtMouseEvent === 'function'
  ) {
    menu.showAtMouseEvent(click_event);
    return true;
  }

  if (
    menu_position
    && typeof menu.showAtPosition === 'function'
  ) {
    menu.showAtPosition(menu_position);
    return true;
  }

  if (
    click_event
    && typeof menu.showAtMouseEvent === 'function'
  ) {
    menu.showAtMouseEvent(click_event);
    return true;
  }

  return false;
}

/**
 * Build the current source's Smart Context and open its copy-depth menu.
 *
 * @this {import('smart-sources').SmartSource}
 * @param {object} [params={}]
 * @param {object} [params.plugin]
 * @param {string} [params.source_path]
 * @param {string} [params.markdown]
 * @param {MouseEvent|KeyboardEvent|object} [params.click_event]
 * @returns {Promise<boolean>}
 */
export async function source_open_copy_current_menu(params = {}) {
  const plugin = params.plugin || this?.env?.plugin;
  const source_path = params.source_path || this?.key;
  if (!plugin || !source_path) return false;

  const menu_position = get_copy_menu_position(params.click_event);
  const copy_ctx = await build_current_copy_context(plugin, {
    source: this,
    source_path,
    markdown: params.markdown,
  });
  if (!copy_ctx) return false;

  const app = plugin.app || this?.env?.obsidian_app;
  if (!app) return false;

  const menu = new Menu(app);
  build_copy_menu(copy_ctx, menu);
  if (!(menu.items?.length > 0)) return false;

  return show_copy_menu(
    menu,
    params.click_event,
    menu_position,
  );
}

function register_when({ plugin }) {
  return plugin.manifest.id === 'smart-context';
}

function when({ env, params, scope }) {
  if (!scope) return false;
  if (!is_copy_current_supported_source(scope, {
    allowed_file_types: params.allowed_file_types,
  })) {
    return false;
  }

  return Boolean(
    (params.plugin?.app || env.obsidian_app)
    && env.smart_contexts
    && typeof env.build_menu === 'function'
  );
}

export const ribbon_icons = {
  copy_context: {
    icon_name: 'smart-copy-note',
    description: 'Smart Context: Copy current',
    register_when,

    params(ribbon_ctx) {
      return get_open_copy_menu_placement_params(ribbon_ctx);
    },

    when,
  },
};
