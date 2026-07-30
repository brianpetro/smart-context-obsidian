import {
  Menu,
  Platform,
  setIcon,
} from 'obsidian';
import { build_path_tree } from 'obsidian-smart-env/src/utils/smart-context/build_path_tree.js';
import { create_render_scheduler } from 'obsidian-smart-env/src/utils/render_utils.js';
import { register_item_hover_popover } from 'obsidian-smart-env/src/utils/register_item_hover_popover.js';
import { get_truncated_context_selections } from '../../utils/context_output_guard.js';
import styles from './builder_tree.css';

export const version = '3.1.5';

export const BUILDER_TREE_COLLAPSE_THRESHOLD = 50;
export const BUILDER_TREE_CHILD_BATCH_SIZE = 100;
const ROOT_LIST_PATH = '__root__';

export function build_html() {
  return '<div class="sc-context-builder-tree"></div>';
}

/**
 * @this {any}
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @returns {Promise<HTMLElement>}
 */
export async function render(ctx, params = {}) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html());
  const container = frag.firstElementChild;
  container.dataset.contextKey = String(ctx?.data?.key || '');
  post_process.call(this, ctx, container, params);
  return container;
}

/**
 * Render the Builder review tree directly from one canonical ContextItems hydration.
 *
 * The full path tree stays in memory for summaries, removal semantics, and
 * named-context provenance. Only expanded branches are materialized as DOM,
 * keeping the Builder component's single render/event boundary rather than
 * delegating each visible leaf through the legacy component tree.
 *
 * @this {any}
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {object} [params={}]
 * @returns {HTMLElement}
 */
export function post_process(ctx, container, params = {}) {
  let context_item_by_key = new Map();
  let included_context_keys = new Set();
  let has_named_context_selections = false;
  let render_error_reported = false;
  let schedule_render = null;
  let disposed = false;
  let tree_root = null;
  let tree_render_params = null;
  let expanded_paths = new Set();
  let folder_paths = new Set();
  const visible_child_limits = new Map();
  let did_initialize_expansion = false;
  let previous_item_count = null;

  const render_tree_dom = () => {
    const all_expanded = folder_paths.size > 0
      && Array.from(folder_paths).every((path) => expanded_paths.has(path))
    ;
    const list = tree_root && tree_render_params
      ? render_tree_list(tree_root, {
        ...tree_render_params,
        expanded_paths,
        visible_child_limits,
      }, ROOT_LIST_PATH)
      : null
    ;

    container.replaceChildren();
    if (folder_paths.size > 0) {
      const toggle_all_button = document.createElement('button');
      toggle_all_button.type = 'button';
      toggle_all_button.className = 'sc-context-builder-tree-toggle-all';
      toggle_all_button.textContent = all_expanded ? 'Collapse all' : 'Expand all';
      container.appendChild(toggle_all_button);
    }
    if (list) container.appendChild(list);
  };

  const render_tree = () => {
    const context_items = ctx.context_items
      .filter(params.filter)
      .filter((item) => item?.data?.exclude !== true)
    ;
    context_item_by_key = new Map(
      context_items.map((item) => [get_item_key(item), item]),
    );
    included_context_keys = new Set(get_named_contexts_to_watch(ctx).keys());
    has_named_context_selections = Object.values(
      ctx?.data?.context_items || {},
    ).some((item_data) => item_data?.named_context === true);

    tree_root = build_path_tree(context_items);
    const size_totals = get_context_size_totals(context_items);
    tree_render_params = {
      ctx,
      context_item_by_key,
      named_context_cache: new WeakMap(),
      tree_stats_cache: new WeakMap(),
      text_total_size: size_totals.text_total_size,
      media_total_size: size_totals.media_total_size,
      truncated_selections: get_truncated_selection_map(ctx),
    };

    folder_paths = get_tree_folder_paths(tree_root);
    const crossed_collapse_threshold = Number.isFinite(previous_item_count)
      && previous_item_count <= BUILDER_TREE_COLLAPSE_THRESHOLD
      && context_items.length > BUILDER_TREE_COLLAPSE_THRESHOLD
    ;
    if (!did_initialize_expansion || crossed_collapse_threshold) {
      expanded_paths = get_default_expanded_paths(
        tree_root,
        context_items.length,
      );
      did_initialize_expansion = true;
    } else {
      expanded_paths = new Set(
        Array.from(expanded_paths).filter((path) => folder_paths.has(path)),
      );
    }
    previous_item_count = context_items.length;

    render_tree_dom();
    render_error_reported = false;

    try {
      params.on_resolved_items?.(context_items);
    } catch (error) {
      console.error('Context Builder: Failed to report resolved tree items', error);
    }
  };

  const render_tree_safely = () => {
    if (disposed) return;
    try {
      render_tree();
    } catch (error) {
      console.error('Context Builder: Failed to refresh content tree', error);
      if (render_error_reported) return;
      render_error_reported = true;
      ctx?.env?.events?.emit?.('notification:error', {
        level: 'error',
        message: 'Context Builder could not refresh the content tree.',
        details: error instanceof Error ? error.message : String(error || ''),
        event_source: 'context_builder.tree_refresh',
      });
    }
  };
  schedule_render = create_render_scheduler(render_tree_safely);

  const render_tree_dom_safely = () => {
    if (disposed) return;
    try {
      render_tree_dom();
    } catch (error) {
      console.error('Context Builder: Failed to update visible tree rows', error);
      ctx?.env?.events?.emit?.('notification:error', {
        level: 'error',
        message: 'Context Builder could not update the content tree.',
        details: error instanceof Error ? error.message : String(error || ''),
        event_source: 'context_builder.tree_visible_refresh',
      });
    }
  };

  const reveal_missing_items = () => {
    const found_missing = reveal_missing_tree_items(
      tree_root,
      context_item_by_key,
      expanded_paths,
      visible_child_limits,
    );
    if (found_missing) render_tree_dom_safely();
    return found_missing;
  };

  const on_related_context_updated = (payload = {}) => {
    const context_key = String(payload.item_key || '').trim();
    if (!context_key || !included_context_keys.has(context_key)) return;
    schedule_render();
  };

  const on_named_context_lifecycle = () => {
    if (has_named_context_selections) schedule_render();
  };

  const on_click = (event) => {
    const toggle_all_button = event.target?.closest?.(
      '.sc-context-builder-tree-toggle-all',
    );
    if (toggle_all_button && container.contains(toggle_all_button)) {
      event.preventDefault();
      event.stopPropagation();

      const all_expanded = Array.from(folder_paths).every(
        (path) => expanded_paths.has(path),
      );
      expanded_paths = all_expanded ? new Set() : new Set(folder_paths);
      render_tree_dom_safely();
      return;
    }

    const toggle_button = event.target?.closest?.('.sc-context-builder-tree-toggle');
    if (toggle_button && container.contains(toggle_button)) {
      event.preventDefault();
      event.stopPropagation();

      const path = String(toggle_button.dataset.path || '').trim();
      if (!path) return;
      if (expanded_paths.has(path)) expanded_paths.delete(path);
      else expanded_paths.add(path);
      render_tree_dom_safely();
      return;
    }

    const show_more_button = event.target?.closest?.('.sc-context-builder-tree-show-more');
    if (show_more_button && container.contains(show_more_button)) {
      event.preventDefault();
      event.stopPropagation();

      const list_path = show_more_button.dataset.listPath || ROOT_LIST_PATH;
      const current_limit = visible_child_limits.get(list_path)
        || BUILDER_TREE_CHILD_BATCH_SIZE
      ;
      visible_child_limits.set(
        list_path,
        current_limit + BUILDER_TREE_CHILD_BATCH_SIZE,
      );
      render_tree_dom_safely();
      return;
    }

    const remove_button = event.target?.closest?.('.sc-context-builder-tree-remove');
    if (remove_button && container.contains(remove_button)) {
      event.preventDefault();
      event.stopPropagation();

      if (remove_button.classList.contains('is-disabled')) {
        emit_named_context_remove_blocked_notice(
          ctx,
          remove_button.dataset.namedContext,
        );
        return;
      }

      remove_tree_path(ctx, remove_button);
      return;
    }

    const named_context_button = event.target?.closest?.(
      '.sc-context-builder-tree-origin-named-context',
    );
    if (named_context_button && container.contains(named_context_button)) {
      event.preventDefault();
      event.stopPropagation();
      open_named_context(ctx, named_context_button.dataset.namedContext);
      return;
    }

    const item_name = event.target?.closest?.('.sc-context-builder-tree-name[data-item-key]');
    if (!item_name || !container.contains(item_name)) return;

    const context_item = context_item_by_key.get(item_name.dataset.itemKey);
    if (typeof context_item?.open !== 'function') return;

    Promise.resolve()
      .then(() => context_item.open(event))
      .catch((error) => {
        console.error('Context Builder: Failed to open context item', error);
        ctx?.env?.events?.emit?.('notification:error', {
          level: 'error',
          message: 'Failed to open context item.',
          details: error instanceof Error ? error.message : String(error || ''),
          event_source: 'context_builder.tree_open_item',
        });
      })
    ;
  };

  const on_context_menu = (event) => {
    const row = event.target?.closest?.('.sc-context-builder-tree-row[data-item-key]');
    if (!row || !container.contains(row)) return;

    const context_item = context_item_by_key.get(row.dataset.itemKey);
    if (!context_item) return;

    const app = ctx?.env?.obsidian_app
      || ctx?.env?.plugin?.app
      || globalThis.app
    ;
    if (!app) return;

    const named_context = get_context_item_named_context(context_item);
    const remove_disabled = is_core_context(ctx) && Boolean(named_context);
    const menu = new Menu(app);
    const menu_params = {
      ...params,
      context_item,
      smart_context: ctx,
      remove_disabled,
      on_remove: () => {
        ctx.remove_by_path?.(context_item.key);
      },
      on_remove_disabled: () => {
        emit_named_context_remove_blocked_notice(ctx, named_context);
      },
    };

    try {
      const item_ref = get_item_ref(context_item);
      if (item_ref) {
        ctx.env.build_menu?.('source:menu', menu, item_ref, menu_params);
        if (menu.items?.length) menu.addSeparator();
      }
      ctx.env.build_menu?.(
        'context_item:action_menu',
        menu,
        context_item,
        menu_params,
      );
    } catch (error) {
      console.error('Context Builder: Failed to build context item menu', error);
      ctx?.env?.events?.emit?.('notification:error', {
        level: 'error',
        message: 'Context item actions could not be opened.',
        details: error instanceof Error ? error.message : String(error || ''),
        event_source: 'context_builder.tree_context_menu',
      });
      return;
    }

    if (!menu.items?.length) return;
    event.preventDefault();
    event.stopPropagation();
    menu.showAtMouseEvent(event);
  };

  render_tree();
  params.on_ready?.(reveal_missing_items);
  container.addEventListener('click', on_click);
  container.addEventListener('contextmenu', on_context_menu);

  this.attach_disposer(container, [
    ctx.on_event('context:updated', schedule_render),
    ctx.env?.events?.on?.('context:updated', on_related_context_updated),
    ctx.env?.events?.on?.('context:created', on_named_context_lifecycle),
    ctx.env?.events?.on?.('context:deleted', on_named_context_lifecycle),
    ctx.env?.events?.on?.('context:named', on_named_context_lifecycle),
    ctx.env?.events?.on?.('context:renamed', on_named_context_lifecycle),
    () => {
      disposed = true;
      schedule_render.cancel();
      params.on_ready?.(null);
    },
    () => container.removeEventListener('click', on_click),
    () => container.removeEventListener('contextmenu', on_context_menu),
  ]);
  return container;
}

/**
 * @param {object} node
 * @param {object} params
 * @param {string} [list_path=ROOT_LIST_PATH]
 * @returns {HTMLUListElement|null}
 */
function render_tree_list(node, params, list_path = ROOT_LIST_PATH) {
  const children = get_child_nodes(node).sort(sort_tree_items);
  if (!children.length) return null;

  const limit = params.visible_child_limits.get(list_path)
    || BUILDER_TREE_CHILD_BATCH_SIZE
  ;
  const visible_children = children.slice(0, limit);
  const list = document.createElement('ul');
  list.className = 'sc-context-builder-tree-list';
  visible_children.forEach((child) => {
    list.appendChild(render_tree_item(child, params));
  });

  const remaining = children.length - visible_children.length;
  if (remaining > 0) {
    const show_more_item = document.createElement('li');
    show_more_item.className = 'sc-context-builder-tree-more-item';

    const show_more_button = document.createElement('button');
    show_more_button.type = 'button';
    show_more_button.className = 'sc-context-builder-tree-show-more';
    show_more_button.dataset.listPath = list_path;
    show_more_button.textContent = `Show ${Math.min(remaining, BUILDER_TREE_CHILD_BATCH_SIZE).toLocaleString()} more`;
    show_more_button.setAttribute(
      'aria-label',
      `Show more context items. ${remaining.toLocaleString()} remaining.`,
    );
    show_more_item.appendChild(show_more_button);
    list.appendChild(show_more_item);
  }

  return list;
}

/**
 * @param {object} tree_item
 * @param {object} params
 * @returns {HTMLLIElement}
 */
function render_tree_item(tree_item, params) {
  const path = get_item_key(tree_item);
  const context_item = params.context_item_by_key.get(path);
  const is_folder = tree_item.is_file !== true;
  const child_count = get_child_nodes(tree_item).length;
  const has_children = child_count > 0;
  const is_expanded = has_children && params.expanded_paths.has(path);
  const child_list = is_expanded
    ? render_tree_list(tree_item, params, path)
    : null
  ;
  const is_missing = tree_item.exists === false || context_item?.exists === false;
  const remove_state = resolve_tree_item_remove_state(
    params.ctx,
    tree_item,
    params.context_item_by_key,
    params.named_context_cache,
  );
  const truncation = params.truncated_selections.get(normalize_tree_path(path));

  const item = document.createElement('li');
  item.className = `sc-context-builder-tree-item ${is_folder ? 'is-folder' : 'is-file'}`;
  if (is_expanded) item.classList.add('is-expanded');

  const row = document.createElement('div');
  row.className = 'sc-context-builder-tree-row';
  row.dataset.path = path;
  row.dataset.folder = String(is_folder);
  if (context_item) row.dataset.itemKey = context_item.key;
  if (is_missing) row.classList.add('is-missing');
  if (truncation) row.classList.add('is-truncated');
  item.appendChild(row);

  if (has_children) {
    const toggle_button = document.createElement('button');
    toggle_button.type = 'button';
    toggle_button.className = 'clickable-icon sc-context-builder-tree-toggle';
    toggle_button.dataset.path = path;
    toggle_button.setAttribute('aria-expanded', String(is_expanded));
    toggle_button.setAttribute(
      'aria-label',
      `${is_expanded ? 'Collapse' : 'Expand'} ${tree_item.name || path}`,
    );
    setIcon(toggle_button, is_expanded ? 'chevron-down' : 'chevron-right');
    row.appendChild(toggle_button);
  } else {
    const toggle_spacer = document.createElement('span');
    toggle_spacer.className = 'sc-context-builder-tree-toggle-spacer';
    row.appendChild(toggle_spacer);
  }

  const remove_button = document.createElement('button');
  remove_button.type = 'button';
  remove_button.className = 'sc-context-builder-tree-remove';
  remove_button.dataset.path = path;
  remove_button.dataset.folder = String(is_folder);
  if (remove_state.named_context) {
    remove_button.dataset.namedContext = remove_state.named_context;
  }
  if (remove_state.disabled) {
    remove_button.classList.add('is-disabled');
    remove_button.setAttribute('aria-disabled', 'true');
    remove_button.setAttribute(
      'title',
      'Open the named context to remove included items.',
    );
  }
  remove_button.setAttribute(
    'aria-label',
    remove_state.disabled
      ? 'Open named context to edit included items'
      : (is_folder
        ? `Remove ${tree_item.name || path} and its contents`
        : `Remove ${tree_item.name || path}`),
  );
  remove_button.textContent = '×';
  row.appendChild(remove_button);

  const icon = document.createElement('span');
  icon.className = 'sc-context-builder-tree-type-icon';
  setIcon(icon, get_context_item_icon(context_item, is_folder));
  row.appendChild(icon);

  const name = document.createElement(context_item ? 'button' : 'span');
  if (context_item) name.type = 'button';
  name.className = 'sc-context-builder-tree-name';
  name.textContent = context_item
    ? get_context_item_label(context_item)
    : (tree_item.name || path)
  ;
  if (context_item) {
    name.dataset.itemKey = context_item.key;
    register_context_item_preview(name, context_item);
  }
  if (is_missing) {
    name.classList.add('is-missing');
    name.setAttribute('title', 'Missing source');
  }
  row.appendChild(name);

  if (is_folder) {
    const descendant_count = get_tree_item_leaf_count(
      tree_item,
      params.tree_stats_cache,
    );
    if (descendant_count > 0) {
      const count = document.createElement('span');
      count.className = 'sc-context-builder-tree-count';
      count.textContent = `${descendant_count.toLocaleString()} item${descendant_count === 1 ? '' : 's'}`;
      row.appendChild(count);
    }
  }

  if (context_item) {
    const total_size = is_media_context_item(context_item)
      ? params.media_total_size
      : params.text_total_size
    ;
    const size_label = format_size_label(
      get_item_size(context_item),
      total_size,
    );
    if (size_label) {
      const size = document.createElement('span');
      size.className = 'sc-context-builder-tree-size';
      size.textContent = size_label;
      row.appendChild(size);
    }

    render_origin_badges(row, context_item);
  }

  if (truncation) {
    const truncated = document.createElement('span');
    truncated.className = 'sc-context-builder-tree-truncated';
    const max_items = Number(truncation.max_items) || 0;
    truncated.textContent = max_items
      ? `First ${max_items.toLocaleString()} files`
      : 'Truncated'
    ;
    truncated.setAttribute(
      'aria-label',
      'Folder contents were truncated while resolving context.',
    );
    truncated.setAttribute(
      'title',
      'This folder reached the context scan safety cap. Output requires confirmation because it will be incomplete.',
    );
    row.appendChild(truncated);
  }

  if (is_missing) {
    const warning = document.createElement('span');
    warning.className = 'sc-context-builder-tree-warning';
    warning.setAttribute('aria-label', 'Missing source');
    setIcon(warning, 'alert-triangle');
    row.appendChild(warning);
  }

  if (child_list) item.appendChild(child_list);
  return item;
}

/**
 * @param {HTMLElement} row
 * @param {any} context_item
 * @returns {void}
 */
function render_origin_badges(row, context_item) {
  const data = context_item?.data || {};
  const folder_source = typeof data.from_folder === 'string'
    ? data.from_folder
    : (typeof data.folder === 'string' ? data.folder : '')
  ;
  if (folder_source) {
    row.appendChild(create_origin_badge({
      icon: 'folder',
      label: `Included from folder: ${folder_source}`,
      class_name: 'sc-context-builder-tree-origin-folder',
    }));
  }

  const named_context = get_context_item_named_context(context_item);
  if (named_context) {
    const badge = create_origin_badge({
      icon: 'smart-named-contexts',
      label: `Included from named context: ${named_context}`,
      class_name: 'sc-context-builder-tree-origin-named-context',
      interactive: true,
    });
    badge.dataset.namedContext = named_context;
    row.appendChild(badge);
  }
}

/**
 * @param {object} params
 * @returns {HTMLButtonElement}
 */
function create_origin_badge(params) {
  const badge = document.createElement(params.interactive ? 'button' : 'span');
  if (params.interactive) badge.type = 'button';
  badge.className = `sc-context-builder-tree-origin ${params.class_name || ''}`;
  badge.setAttribute('aria-label', params.label);
  setIcon(badge, params.icon);
  return badge;
}

/**
 * @param {HTMLElement} target
 * @param {any} context_item
 * @returns {void}
 */
function register_context_item_preview(target, context_item) {
  const item_ref = get_item_ref(context_item);
  if (!item_ref || context_item?.exists === false) return;

  target.setAttribute(
    'title',
    `Hold ${Platform.isMacOS ? '⌘' : 'Ctrl'} to preview`,
  );
  register_item_hover_popover(target, item_ref);
}

/**
 * @param {any} context_item
 * @returns {any|null}
 */
function get_item_ref(context_item) {
  try {
    return context_item?.item_ref || null;
  } catch (error) {
    return null;
  }
}

/**
 * @param {any} context_item
 * @param {boolean} is_folder
 * @returns {string}
 */
function get_context_item_icon(context_item, is_folder) {
  try {
    return context_item?.icon_type || (is_folder ? 'folder' : 'file-text');
  } catch (error) {
    return is_folder ? 'folder' : 'file-text';
  }
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLButtonElement} remove_button
 * @returns {void}
 */
function remove_tree_path(ctx, remove_button) {
  const path = String(remove_button.dataset.path || '').trim();
  if (!path) return;

  remove_button.disabled = true;
  const folder = remove_button.dataset.folder === 'true';
  try {
    if (typeof ctx.remove_by_path === 'function') {
      const removed_keys = ctx.remove_by_path(path, { folder });
      if (removed_keys === false || (Array.isArray(removed_keys) && !removed_keys.length)) {
        remove_button.disabled = false;
      }
      return;
    }
    ctx.remove_item?.(path);
  } catch (error) {
    remove_button.disabled = false;
    console.error('Context Builder: Failed to remove tree item', error);
  }
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {string} context_name
 * @returns {void}
 */
function open_named_context(ctx, context_name = '') {
  const named_ctx = ctx?.env?.smart_contexts?.get_named_context?.(context_name);
  if (!named_ctx) return;

  if (typeof named_ctx.collection?.open_builder === 'function') {
    named_ctx.collection.open_builder(named_ctx, {
      event_source: 'context_builder.tree_named_context',
    });
    return;
  }
  named_ctx.emit_event?.('context_selector:open');
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {string} [named_context_name='']
 * @returns {void}
 */
function emit_named_context_remove_blocked_notice(ctx, named_context_name = '') {
  const context_name = String(named_context_name || '').trim();
  const named_ctx = context_name
    ? ctx?.env?.smart_contexts?.get_named_context?.(context_name)
    : null
  ;
  const message = context_name
    ? `This item is included from named context "${context_name}". Open that named context to remove it there.`
    : 'This item is included from a named context. Open the named context to remove it there.'
  ;

  ctx?.emit_event?.('context:named_context_remove_blocked', {
    level: 'warning',
    message,
    event_source: 'context_builder.tree_remove_named_context_child',
    named_context_name: context_name,
    ...(named_ctx ? {
      btn_text: 'Open named context',
      btn_callback: 'context_selector:open',
      btn_event_key: 'context_selector:open',
      btn_event_payload: {
        collection_key: 'smart_contexts',
        item_key: named_ctx.key,
      },
    } : {}),
  });
}

/**
 * @param {any} context_item
 * @returns {string}
 */
function get_context_item_named_context(context_item) {
  const named_context = context_item?.data?.from_named_context;
  return typeof named_context === 'string' ? named_context.trim() : '';
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {boolean}
 */
function is_core_context(ctx) {
  return ctx?.env?.is_pro !== true;
}

/**
 * Resolve whether a tree row can remove its represented path in the current
 * product tier.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} tree_item
 * @param {Map<string, any>} context_item_by_key
 * @param {WeakMap<object, Set<string>>} [cache]
 * @returns {{disabled:boolean, named_context:string}}
 */
export function resolve_tree_item_remove_state(
  ctx,
  tree_item,
  context_item_by_key,
  cache = new WeakMap(),
) {
  if (!is_core_context(ctx)) {
    return { disabled: false, named_context: '' };
  }

  const named_contexts = get_tree_item_named_contexts(
    tree_item,
    context_item_by_key,
    cache,
  );
  return {
    disabled: named_contexts.size > 0,
    named_context: named_contexts.size === 1
      ? Array.from(named_contexts)[0]
      : '',
  };
}

/**
 * @param {object} tree_item
 * @param {Map<string, any>} context_item_by_key
 * @param {WeakMap<object, Set<string>>} cache
 * @returns {Set<string>}
 */
function get_tree_item_named_contexts(tree_item, context_item_by_key, cache) {
  const cached = cache.get(tree_item);
  if (cached) return cached;

  const named_contexts = new Set();
  const context_item = context_item_by_key.get(get_item_key(tree_item));
  const named_context = get_context_item_named_context(context_item);
  if (named_context) named_contexts.add(named_context);

  get_child_nodes(tree_item).forEach((child) => {
    get_tree_item_named_contexts(child, context_item_by_key, cache)
      .forEach((context_name) => named_contexts.add(context_name));
  });

  cache.set(tree_item, named_contexts);
  return named_contexts;
}

/**
 * Collect direct and nested named contexts whose updates affect the rendered
 * content tree.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {Map<string, import('smart-contexts').SmartContext>}
 */
export function get_named_contexts_to_watch(ctx) {
  const named_contexts = new Map();
  const visited_contexts = new Set();

  const collect = (source_ctx) => {
    if (!source_ctx || visited_contexts.has(source_ctx)) return;
    visited_contexts.add(source_ctx);

    const add_named_context = (named_ctx, fallback_key = '') => {
      if (!named_ctx || visited_contexts.has(named_ctx)) return;
      const context_key = String(named_ctx.key || fallback_key || '').trim();
      if (!context_key) return;
      if (!named_contexts.has(context_key)) {
        named_contexts.set(context_key, named_ctx);
      }
      collect(named_ctx);
    };

    const direct_named_contexts = Array.isArray(source_ctx.named_contexts)
      ? source_ctx.named_contexts
      : []
    ;
    direct_named_contexts.forEach((named_ctx) => {
      add_named_context(named_ctx);
    });

    Object.entries(source_ctx?.data?.context_items || {})
      .forEach(([key, item_data = {}]) => {
        if (item_data.named_context !== true) return;

        const context_name = String(item_data.key || key || '').trim();
        if (!context_name) return;
        const named_ctx = source_ctx?.env?.smart_contexts
          ?.get_named_context?.(context_name)
        ;
        add_named_context(named_ctx, context_name);
      });
  };

  collect(ctx);
  return named_contexts;
}

/**
 * Expand every branch needed to show missing context items. Lazy child lists
 * are widened only far enough to include the last missing item in each branch.
 *
 * @param {object} tree_root
 * @param {Map<string, any>} context_item_by_key
 * @param {Set<string>} expanded_paths
 * @param {Map<string, number>} visible_child_limits
 * @returns {boolean}
 */
export function reveal_missing_tree_items(
  tree_root,
  context_item_by_key,
  expanded_paths,
  visible_child_limits,
) {
  const reveal_node = (node, list_path) => {
    const children = get_child_nodes(node).sort(sort_tree_items);
    let found_missing = false;

    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      const path = get_item_key(child);
      const context_item = context_item_by_key.get(path);
      const child_is_missing = child.exists === false
        || context_item?.exists === false
      ;
      const child_has_missing = reveal_node(child, path);
      if (!child_is_missing && !child_has_missing) continue;

      found_missing = true;
      const current_limit = visible_child_limits.get(list_path)
        || BUILDER_TREE_CHILD_BATCH_SIZE
      ;
      if (index >= current_limit) {
        const required_limit = Math.ceil(
          (index + 1) / BUILDER_TREE_CHILD_BATCH_SIZE,
        ) * BUILDER_TREE_CHILD_BATCH_SIZE;
        visible_child_limits.set(list_path, required_limit);
      }
      if (get_child_nodes(child).length) expanded_paths.add(path);
    }

    return found_missing;
  };

  return reveal_node(tree_root, ROOT_LIST_PATH);
}

/**
 * Expand every folder only while the resolved context is small. Larger
 * contexts render collapsed and materialize descendants on demand.
 *
 * @param {object} tree_root
 * @param {number} item_count
 * @param {number} [collapse_threshold=BUILDER_TREE_COLLAPSE_THRESHOLD]
 * @returns {Set<string>}
 */
export function get_default_expanded_paths(
  tree_root,
  item_count,
  collapse_threshold = BUILDER_TREE_COLLAPSE_THRESHOLD,
) {
  if (item_count > collapse_threshold) return new Set();
  return get_tree_folder_paths(tree_root);
}

/**
 * @param {object} tree_root
 * @returns {Set<string>}
 */
function get_tree_folder_paths(tree_root) {
  const paths = new Set();
  const collect = (node) => {
    get_child_nodes(node).forEach((child) => {
      if (!get_child_nodes(child).length) return;
      const path = get_item_key(child);
      if (path) paths.add(path);
      collect(child);
    });
  };
  collect(tree_root);
  return paths;
}

/**
 * @param {object} tree_item
 * @param {WeakMap<object, number>} cache
 * @returns {number}
 */
export function get_tree_item_leaf_count(tree_item, cache = new WeakMap()) {
  const cached = cache.get(tree_item);
  if (Number.isFinite(cached)) return cached;

  const children = get_child_nodes(tree_item);
  const count = children.length
    ? children.reduce((sum, child) => {
      return sum + get_tree_item_leaf_count(child, cache);
    }, 0)
    : 1
  ;
  cache.set(tree_item, count);
  return count;
}

/**
 * @param {Array<any>} context_items
 * @returns {{text_total_size:number,media_total_size:number}}
 */
export function get_context_size_totals(context_items = []) {
  return (Array.isArray(context_items) ? context_items : [])
    .reduce((totals, item) => {
      if (is_media_context_item(item)) {
        totals.media_total_size += get_item_size(item);
      } else {
        totals.text_total_size += get_item_size(item);
      }
      return totals;
    }, {
      text_total_size: 0,
      media_total_size: 0,
    })
  ;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {Map<string, {key:string,max_items:number}>}
 */
function get_truncated_selection_map(ctx) {
  const selections = new Map();
  get_truncated_context_selections(ctx).forEach((item) => {
    const item_key = normalize_tree_path(item.key);
    if (!item_key) return;
    selections.set(item_key, {
      key: item_key,
      max_items: item.max_items,
    });
  });
  return selections;
}

/**
 * @param {string} path
 * @returns {string}
 */
function normalize_tree_path(path = '') {
  return String(path || '').trim().replace(/\\+/g, '/').replace(/\/+$/g, '');
}

/**
 * @param {any} context_item
 * @returns {boolean}
 */
function is_media_context_item(context_item) {
  try {
    return context_item?.is_media === true;
  } catch (error) {
    return false;
  }
}

/**
 * @param {any} item
 * @returns {string}
 */
function get_item_key(item) {
  return String(item?.key || item?.path || '').trim();
}

/**
 * @param {object} node
 * @returns {object[]}
 */
function get_child_nodes(node) {
  if (!node?.children || Array.isArray(node.children)) return [];
  return Object.values(node.children);
}

/**
 * @param {object} left
 * @param {object} right
 * @returns {number}
 */
function sort_tree_items(left, right) {
  if (left.is_file !== right.is_file) return left.is_file ? 1 : -1;
  return String(left.name || '').localeCompare(String(right.name || ''));
}

/**
 * @param {any} item
 * @returns {number}
 */
function get_item_size(item) {
  const size = Number(item?.size ?? item?.data?.size);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

/**
 * @param {any} context_item
 * @returns {string}
 */
export function get_context_item_label(context_item) {
  const key = get_item_key(context_item);
  const [source_path, ...block_parts] = key.split('#');
  const source_name = source_path.split('/').pop() || source_path;
  if (!block_parts.length) return source_name;

  const block_name = block_parts.filter(Boolean).pop() || '';
  if (block_name.startsWith('{')) {
    const item_ref = get_item_ref(context_item);
    const lines = Array.isArray(item_ref?.lines)
      ? item_ref.lines.join('-')
      : ''
    ;
    return lines ? `${source_name} › Lines ${lines}` : `${source_name} › ${block_name}`;
  }
  return `${source_name} › ${block_name}`;
}

/**
 * @param {number} size
 * @param {number} total_size
 * @returns {string}
 */
export function format_size_label(size, total_size) {
  const numeric_size = Number(size);
  if (!Number.isFinite(numeric_size) || numeric_size <= 0) return '';

  const percent = Number.isFinite(total_size) && total_size > 0
    ? `${format_percent((numeric_size / total_size) * 100)}% `
    : ''
  ;
  return `${percent}(${format_bytes(numeric_size)})`;
}

/**
 * @param {number} value
 * @returns {string}
 */
function format_percent(value) {
  if (value > 0 && value < 0.1) return '<0.1';
  const precision = value >= 10 || Number.isInteger(value) ? 0 : 1;
  return Number.parseFloat(value.toFixed(precision)).toString();
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function format_bytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit_index = 0;
  while (value >= 1024 && unit_index < units.length - 1) {
    value /= 1024;
    unit_index += 1;
  }

  const precision = value >= 10 || Number.isInteger(value) ? 0 : 1;
  return `${Number.parseFloat(value.toFixed(precision))} ${units[unit_index]}`;
}
