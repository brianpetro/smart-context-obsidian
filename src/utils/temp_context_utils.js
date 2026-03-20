import {
  get_links_to_depth,
} from 'smart-sources/actions/get_links_to_depth.js';
import {
  LINK_DIRECTIONS,
  build_context_items_from_graphs,
  includes_inlinks,
  includes_outlinks,
  merge_context_items_min_depth,
  normalize_link_direction,
} from './link_graph_context_items.js';

/**
 * @param {string} value
 * @returns {string}
 */
function normalize_string(value = '') {
  return String(value ?? '').trim();
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function coerce_non_negative_int(value, fallback) {
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) value = parsed;
  }
  if (!Number.isFinite(value)) return fallback;
  const int_value = Math.floor(value);
  return int_value >= 0 ? int_value : fallback;
}

/**
 * Clone a context_items map while preserving stored metadata.
 *
 * @param {Record<string, object>} context_items
 * @returns {Record<string, object>}
 */
export function clone_context_items_map(context_items = {}) {
  return Object.entries(context_items || {}).reduce((acc, [item_key, item_data]) => {
    if (!item_key) return acc;

    acc[item_key] = {
      ...(item_data && typeof item_data === 'object' ? item_data : {}),
      key: item_data?.key || item_key,
    };

    return acc;
  }, {});
}

/**
 * Build a temporary SmartContext instance without saving it into the collection.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {string} [params.key]
 * @param {Record<string, object>} [params.context_items]
 * @param {Record<string, unknown>} [params.data]
 * @returns {import('smart-contexts').SmartContext|null}
 */
export function create_temp_context(ctx, params = {}) {
  if (!ctx?.env) return null;

  const TempClass = ctx.constructor;
  const temp_data = {
    ...(ctx.data || {}),
    ...(params.data && typeof params.data === 'object' ? params.data : {}),
    key: normalize_string(params.key) || `${ctx.key}#temp`,
    context_items: clone_context_items_map(
      params.context_items || ctx?.data?.context_items || {},
    ),
  };

  const temp_ctx = new TempClass(ctx.env, temp_data);
  temp_ctx.collection = ctx.collection;
  return temp_ctx;
}

/**
 * @param {string} item_key
 * @param {Record<string, unknown>} item_data
 * @returns {Record<string, unknown>}
 */
function normalize_codeblock_copy_item(item_key, item_data = {}) {
  const existing_item = item_data && typeof item_data === 'object'
    ? item_data
    : {}
  ;

  return {
    ...existing_item,
    key: existing_item.key || item_key,
    d: 0,
  };
}

/**
 * Merge source-get-context items with codeblock items for copy-current flows.
 * Codeblock items are always treated as depth zero.
 *
 * @param {Record<string, object>} source_context_items
 * @param {Record<string, object>} codeblock_context_items
 * @returns {Record<string, object>}
 */
function merge_copy_current_context_items(source_context_items = {}, codeblock_context_items = {}) {
  const merged_context_items = clone_context_items_map(source_context_items);

  Object.entries(codeblock_context_items || {}).forEach(([item_key, item_data]) => {
    if (!item_key) return;

    const existing_item = merged_context_items[item_key] || {};
    const normalized_item = normalize_codeblock_copy_item(item_key, item_data);

    merged_context_items[item_key] = {
      ...existing_item,
      ...normalized_item,
      key: normalized_item.key || item_key,
      d: 0,
    };
  });

  return merged_context_items;
}

/**
 * Build a temporary copy-current context that includes codeblock items at depth zero.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {import('smart-contexts').SmartContext} [params.codeblock_ctx]
 * @param {string} [params.key]
 * @returns {import('smart-contexts').SmartContext|null}
 */
export function build_copy_current_context(ctx, params = {}) {
  if (!ctx) return null;

  const codeblock_ctx = params.codeblock_ctx;
  const codeblock_context_items = codeblock_ctx?.data?.context_items || {};
  if (!Object.keys(codeblock_context_items).length) return ctx;

  const merged_context_items = merge_copy_current_context_items(
    ctx?.data?.context_items || {},
    codeblock_context_items,
  );

  return create_temp_context(ctx, {
    key: normalize_string(params.key) || `${ctx.key}#copy_current`,
    context_items: merged_context_items,
  }) || ctx;
}

/**
 * Detect if a context item key should be used as a SmartSource root for traversal.
 *
 * @param {any} env
 * @param {string} key
 * @returns {boolean}
 */
function is_traversable_source_key(env, key) {
  if (typeof key !== 'string' || !key) return false;
  if (key.startsWith('external:')) return false;
  if (key.includes('#')) return false;
  if (!env?.smart_sources?.get) return false;
  return Boolean(env.smart_sources.get(key));
}

/**
 * Build a temporary named-context copy context with link expansion.
 *
 * Rules:
 * - Does not mutate the saved named context.
 * - Only depth-zero traversable SmartSource items become link roots.
 * - Preserves explicit excludes already stored on the named context.
 * - Uses the same outlink/inlink normalization as source_get_context.
 *
 * @param {import('smart-contexts').SmartContext} named_ctx
 * @param {object} [params={}]
 * @param {number} [params.max_depth=3]
 * @param {'out'|'in'|'both'} [params.direction='both']
 * @param {string} [params.key]
 * @returns {Promise<import('smart-contexts').SmartContext|null>}
 */
export async function build_named_context_copy_context(named_ctx, params = {}) {
  if (!named_ctx?.env) return null;

  const max_depth = coerce_non_negative_int(params.max_depth, 3);
  const direction = normalize_link_direction(params.direction);

  const base_items = named_ctx?.data?.context_items || {};
  const merged_context_items = clone_context_items_map(base_items);

  const root_keys = Object.entries(base_items)
    .filter(([item_key, item_data]) => {
      if (!item_key) return false;
      if (item_data?.exclude) return false;
      if ((Number.isFinite(item_data?.d) ? item_data.d : 0) !== 0) return false;
      return is_traversable_source_key(named_ctx.env, item_key);
    })
    .map(([item_key]) => item_key)
  ;
  const unique_root_keys = [...new Set(root_keys)];

  for (const root_key of unique_root_keys) {
    const root_source = named_ctx.env?.smart_sources?.get?.(root_key);
    if (!root_source) continue;

    const outlink_graph = includes_outlinks(direction)
      ? await get_links_to_depth(root_source, max_depth, {
        direction: LINK_DIRECTIONS.OUT,
        include_self: true,
      })
      : []
    ;
    const inlink_graph = includes_inlinks(direction)
      ? await get_links_to_depth(root_source, max_depth, {
        direction: LINK_DIRECTIONS.IN,
        include_self: true,
      })
      : []
    ;

    const linked_context_items = build_context_items_from_graphs({
      outlink_graph,
      inlink_graph,
      root_source,
      include_root: false,
    });

    merge_context_items_min_depth(merged_context_items, linked_context_items, {
      preserve_excluded: true,
    });
  }

  const base_key = named_ctx?.data?.key || named_ctx?.key || Date.now().toString();

  return create_temp_context(named_ctx, {
    key: normalize_string(params.key) || `${base_key}#copy`,
    context_items: merged_context_items,
  });
}
