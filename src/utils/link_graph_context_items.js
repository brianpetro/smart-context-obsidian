import { LINK_DIRECTIONS } from 'smart-sources/actions/get_links_to_depth.js';

export { LINK_DIRECTIONS };

/**
 * Normalize link traversal direction.
 *
 * @param {unknown} direction
 * @returns {'out'|'in'|'both'}
 */
export function normalize_link_direction(direction) {
  if (direction && Object.values(LINK_DIRECTIONS).includes(direction)) {
    return direction;
  }
  return LINK_DIRECTIONS.BOTH;
}

/**
 * @param {'out'|'in'|'both'} direction
 * @returns {boolean}
 */
export function includes_outlinks(direction) {
  return direction === LINK_DIRECTIONS.OUT || direction === LINK_DIRECTIONS.BOTH;
}

/**
 * @param {'out'|'in'|'both'} direction
 * @returns {boolean}
 */
export function includes_inlinks(direction) {
  return direction === LINK_DIRECTIONS.IN || direction === LINK_DIRECTIONS.BOTH;
}

/**
 * Collect embedded outlink keys from the root source.
 *
 * Embedded outlinks are treated as depth zero because they are rendered as part
 * of the root note rather than as a traversed neighbor.
 *
 * @param {any} root_source
 * @returns {Set<string>}
 */
export function get_embedded_outlink_keys(root_source) {
  const outlinks = Array.isArray(root_source?.outlinks) ? root_source.outlinks : [];
  const keys = outlinks
    .filter((link) => link && typeof link.key === 'string' && link.embedded === true)
    .map((link) => link.key)
  ;
  return new Set(keys);
}

/**
 * Normalize a link graph:
 * - optional root exclusion
 * - embedded outlinks collapse to depth zero
 * - smallest depth wins for duplicate keys
 * - sorted by depth then key for stable UI
 *
 * @param {Array<{ depth:number, item:any }>} graph
 * @param {object} [params={}]
 * @param {any|null} [params.root_source=null]
 * @param {boolean} [params.exclude_root=false]
 * @param {boolean} [params.sort=true]
 * @returns {Array<{ depth:number, item:any }>}
 */
export function normalize_graph_link_entries(graph = [], params = {}) {
  if (!Array.isArray(graph) || !graph.length) return [];

  const root_source = params.root_source || null;
  const exclude_root = params.exclude_root === true;
  const sort = params.sort !== false;

  const root_key = typeof root_source?.key === 'string' ? root_source.key : '';
  const embedded_outlink_keys = get_embedded_outlink_keys(root_source);

  /** @type {Map<string, { depth:number, item:any }>} */
  const by_key = new Map();

  for (let i = 0; i < graph.length; i += 1) {
    const entry = graph[i];
    const item = entry?.item;
    const key = typeof item?.key === 'string' ? item.key : '';
    if (!key) continue;
    if (exclude_root && root_key && key === root_key) continue;

    let depth = Number.isFinite(entry?.depth) ? entry.depth : 0;
    if (depth > 0 && embedded_outlink_keys.has(key)) {
      depth = 0;
    }

    const existing = by_key.get(key);
    if (!existing || depth < existing.depth) {
      by_key.set(key, { depth, item });
    }
  }

  const normalized = Array.from(by_key.values());

  if (sort) {
    normalized.sort((left, right) => {
      if (left.depth !== right.depth) return left.depth - right.depth;
      const left_key = String(left.item?.key || '');
      const right_key = String(right.item?.key || '');
      return left_key.localeCompare(right_key);
    });
  }

  return normalized;
}

/**
 * Build a context_items payload from one traversal graph.
 *
 * @param {Array<{ depth:number, item:any }>} graph
 * @param {object} [params={}]
 * @param {any|null} [params.root_source=null]
 * @param {boolean} [params.include_root=true]
 * @param {boolean} [params.mark_link=true]
 * @returns {Record<string, { d:number, mtime?:number, size?:number, link?:boolean }>}
 */
export function build_context_items_from_graph(graph = [], params = {}) {
  const normalized = normalize_graph_link_entries(graph, {
    root_source: params.root_source || null,
    exclude_root: params.include_root === false,
    sort: true,
  });

  /** @type {Record<string, { d:number, mtime?:number, size?:number, link?:boolean }>} */
  const context_items = {};

  for (let i = 0; i < normalized.length; i += 1) {
    const entry = normalized[i];
    const item = entry.item;
    const key = item?.key;
    if (!key) continue;

    const existing = context_items[key] || {};
    const next_item = {
      ...existing,
      d: Number.isFinite(existing?.d) ? Math.min(existing.d, entry.depth) : entry.depth,
      mtime: item?.mtime,
      size: item?.size,
    };

    if (params.mark_link !== false) {
      next_item.link = true;
    }

    context_items[key] = next_item;
  }

  return context_items;
}

/**
 * Merge incoming context items into a target map while keeping the smallest
 * depth for each key.
 *
 * @param {Record<string, any>} target
 * @param {Record<string, any>} incoming
 * @param {object} [params={}]
 * @param {boolean} [params.preserve_excluded=true]
 * @returns {Record<string, any>}
 */
export function merge_context_items_min_depth(target = {}, incoming = {}, params = {}) {
  const preserve_excluded = params.preserve_excluded !== false;

  for (const [key, raw_value] of Object.entries(incoming || {})) {
    if (!key) continue;

    const incoming_value = raw_value && typeof raw_value === 'object'
      ? raw_value
      : {}
    ;
    const existing = target[key];

    if (preserve_excluded && existing?.exclude) continue;

    const existing_depth = Number.isFinite(existing?.d) ? existing.d : Infinity;
    const incoming_depth = Number.isFinite(incoming_value?.d) ? incoming_value.d : 0;

    target[key] = {
      ...(existing && typeof existing === 'object' ? existing : {}),
      ...incoming_value,
      d: Number.isFinite(existing_depth)
        ? Math.min(existing_depth, incoming_depth)
        : incoming_depth,
    };
  }

  return target;
}

/**
 * Build a context_items payload from separate outlink and inlink graphs.
 *
 * `inlink: true` is only applied when an item comes from the inlink traversal
 * and is not also present as an outlink.
 *
 * @param {object} [params={}]
 * @param {Array<{ depth:number, item:any }>} [params.outlink_graph=[]]
 * @param {Array<{ depth:number, item:any }>} [params.inlink_graph=[]]
 * @param {any|null} [params.root_source=null]
 * @param {boolean} [params.include_root=true]
 * @returns {Record<string, { d:number, mtime?:number, size?:number, link?:boolean, inlink?:boolean }>}
 */
export function build_context_items_from_graphs(params = {}) {
  const {
    outlink_graph = [],
    inlink_graph = [],
    root_source = null,
    include_root = true,
  } = params;

  const outlink_items = build_context_items_from_graph(outlink_graph, {
    root_source,
    include_root,
  });
  const inlink_items = build_context_items_from_graph(inlink_graph, {
    root_source,
    include_root,
  });

  const merged_items = merge_context_items_min_depth({}, outlink_items, {
    preserve_excluded: false,
  });
  merge_context_items_min_depth(merged_items, inlink_items, {
    preserve_excluded: false,
  });

  for (const key of Object.keys(merged_items)) {
    const has_outlink = Object.prototype.hasOwnProperty.call(outlink_items, key);
    const has_inlink = Object.prototype.hasOwnProperty.call(inlink_items, key);
    merged_items[key].inlink = has_inlink && !has_outlink;
  }

  return merged_items;
}
