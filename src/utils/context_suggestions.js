/**
 * Build suggestion entries for each depth.
 *
 * Depth 0 intentionally renders only one default suggestion because backlinks
 * do not change a pure "current note" selection. When the merged copy-current
 * context contains additional items sourced from the note's context codeblock,
 * a second depth 0 suggestion can be added for "without codeblock" so the user
 * can copy only the base current-note context.
 *
 * @param {Array<{ data?: { d?: number, inlink?: boolean }, size?: number }>} ctx_items
 * @param {object} [params={}]
 * @param {Array<object>} [params.raw_context_items]
 * @returns {Array<{ d:number, count:number, size:number, sizes:number, include_inlinks:boolean, without_codeblock?: boolean, variant:string }>}
 */
export function build_depth_suggestions(ctx_items = [], params = {}) {
  if (!Array.isArray(ctx_items) || !ctx_items.length) {
    return [];
  }

  const normalized_items = ctx_items.map((item) => ({
    item,
    depth: get_item_depth(item),
  }));
  const max_depth = normalized_items.reduce((max_value, entry) => {
    return Math.max(max_value, entry.depth);
  }, 0);

  const suggestions_by_depth = Array.from({ length: max_depth + 1 }, (_, depth) => ({
    depth,
    outlinks_only: create_suggestion_entry(depth, 'outlinks_only'),
    include_inlinks: depth > 0
      ? create_suggestion_entry(depth, 'include_inlinks')
      : null,
  }));

  for (const entry of normalized_items) {
    const item_depth = entry.depth;

    for (let depth = item_depth; depth <= max_depth; depth += 1) {
      const bucket = suggestions_by_depth[depth];
      if (!bucket) {
        continue;
      }

      if (!is_item_inlink(entry.item)) {
        add_item_to_suggestion(bucket.outlinks_only, entry.item);
      }

      if (bucket.include_inlinks) {
        add_item_to_suggestion(bucket.include_inlinks, entry.item);
      }
    }
  }

  const without_codeblock_depth_zero = build_without_codeblock_depth_zero_suggestion(
    params.raw_context_items,
  );

  const suggestions = [];
  for (const bucket of suggestions_by_depth) {
    suggestions.push(bucket.outlinks_only);

    if (bucket.depth === 0) {
      if (
        without_codeblock_depth_zero
        && depth_suggestions_differ(bucket.outlinks_only, without_codeblock_depth_zero)
      ) {
        suggestions.push(without_codeblock_depth_zero);
      }
      continue;
    }

    if (bucket.include_inlinks) {
      suggestions.push(bucket.include_inlinks);
    }
  }

  return suggestions;
}

/**
 * Build a raw context_items map for depth 0 without codeblock-derived content.
 *
 * This restores the original depth/inlink metadata from the base current-note
 * context before codeblock items were merged in.
 *
 * @param {Array<object>} raw_context_items
 * @returns {Record<string, object>}
 */
export function build_without_codeblock_depth_zero_context_items(raw_context_items = []) {
  if (!Array.isArray(raw_context_items) || !raw_context_items.length) {
    return {};
  }

  return raw_context_items.reduce((acc, raw_item) => {
    if (!should_include_without_codeblock_depth_zero(raw_item)) {
      return acc;
    }

    const raw_data = get_item_data(raw_item);
    const key = String(raw_data?.key || raw_item?.key || '').trim();
    if (!key) {
      return acc;
    }

    const next_item_data = {
      ...raw_data,
      key,
      d: get_base_item_depth(raw_item),
      inlink: get_base_item_inlink(raw_item),
    };

    delete next_item_data.base_context;
    delete next_item_data.base_d;
    delete next_item_data.base_inlink;
    delete next_item_data.from_codeblock;

    acc[key] = next_item_data;
    return acc;
  }, {});
}

/**
 * Estimate tokens from characters using the same rough 4-char heuristic used
 * elsewhere in Smart Context.
 *
 * @param {number} char_count
 * @returns {number}
 */
export function estimate_tokens(char_count = 0) {
  const numeric_value = Number(char_count);
  if (!Number.isFinite(numeric_value) || numeric_value <= 0) {
    return 0;
  }
  return Math.ceil(numeric_value / 4);
}

/**
 * Round an estimate up to the nearest user-facing step.
 *
 * Rules:
 * - Up to 10,000 => always round up to the next 500
 * - Over 10,000 => always round up to the next 1,000
 *
 * @param {number} value
 * @returns {number}
 */
export function round_up_context_estimate(value = 0) {
  const numeric_value = Number(value);
  if (!Number.isFinite(numeric_value) || numeric_value <= 0) {
    return 0;
  }

  const step = numeric_value > 10000 ? 1000 : 500;
  return Math.ceil(numeric_value / step) * step;
}

/**
 * Format a rounded estimate into compact human-readable text.
 *
 * Examples:
 * - 867 -> 1K
 * - 1103 -> 1.5K
 *
 * @param {number} value
 * @returns {string}
 */
export function format_context_estimate(value = 0) {
  const rounded_value = round_up_context_estimate(value);
  if (rounded_value === 0) {
    return '0';
  }

  if (rounded_value < 1000) {
    return rounded_value.toLocaleString();
  }

  const thousands = rounded_value / 1000;
  if (Number.isInteger(thousands)) {
    return `${thousands}K`;
  }

  return `${thousands.toFixed(1).replace(/\.0$/, '')}K`;
}

/**
 * @param {object} item
 * @returns {object}
 */
function get_item_data(item) {
  if (item?.data && typeof item.data === 'object') {
    return item.data;
  }
  return item && typeof item === 'object' ? item : {};
}

/**
 * @param {object} item
 * @returns {number}
 */
function get_item_depth(item) {
  const item_data = get_item_data(item);
  return Number.isFinite(item_data?.d) ? item_data.d : 0;
}

/**
 * @param {object} item
 * @returns {boolean}
 */
function is_item_inlink(item) {
  const item_data = get_item_data(item);
  return item_data?.inlink === true;
}

/**
 * @param {object} item
 * @returns {number}
 */
function get_item_size(item) {
  if (Number.isFinite(item?.size) && item.size > 0) {
    return item.size;
  }

  const item_data = get_item_data(item);
  if (Number.isFinite(item_data?.size) && item_data.size > 0) {
    return item_data.size;
  }

  return 0;
}

/**
 * @param {object} raw_item
 * @returns {number}
 */
function get_base_item_depth(raw_item) {
  const item_data = get_item_data(raw_item);
  return Number.isFinite(item_data?.base_d) ? item_data.base_d : get_item_depth(raw_item);
}

/**
 * @param {object} raw_item
 * @returns {boolean}
 */
function get_base_item_inlink(raw_item) {
  const item_data = get_item_data(raw_item);
  if (typeof item_data?.base_inlink === 'boolean') {
    return item_data.base_inlink;
  }
  return is_item_inlink(raw_item);
}

/**
 * @param {number} depth
 * @param {string} variant
 * @returns {{ d:number, count:number, size:number, sizes:number, include_inlinks:boolean, without_codeblock:boolean, variant:string }}
 */
function create_suggestion_entry(depth, variant) {
  return {
    d: depth,
    count: 0,
    size: 0,
    sizes: 0,
    include_inlinks: variant === 'include_inlinks',
    without_codeblock: variant === 'without_codeblock',
    variant,
  };
}

/**
 * @param {{ count:number, size:number, sizes:number }} suggestion
 * @param {{ size?: number }} item
 * @returns {void}
 */
function add_item_to_suggestion(suggestion, item) {
  suggestion.count += 1;
  const item_size = get_item_size(item);
  if (item_size > 0) {
    suggestion.size += item_size;
    suggestion.sizes += 1;
  }
}

/**
 * @param {Array<object>} raw_context_items
 * @returns {boolean}
 */
function has_codeblock_raw_items(raw_context_items = []) {
  if (!Array.isArray(raw_context_items)) {
    return false;
  }

  return raw_context_items.some((raw_item) => {
    const item_data = get_item_data(raw_item);
    return item_data?.from_codeblock === true;
  });
}

/**
 * @param {object} raw_item
 * @returns {boolean}
 */
function should_include_without_codeblock_depth_zero(raw_item) {
  const item_data = get_item_data(raw_item);
  if (item_data?.base_context !== true) {
    return false;
  }
  if (get_base_item_depth(raw_item) > 0) {
    return false;
  }
  if (get_base_item_inlink(raw_item)) {
    return false;
  }
  return true;
}

/**
 * @param {Array<object>} raw_context_items
 * @returns {{ d:number, count:number, size:number, sizes:number, include_inlinks:boolean, without_codeblock:boolean, variant:string }|null}
 */
function build_without_codeblock_depth_zero_suggestion(raw_context_items = []) {
  if (!has_codeblock_raw_items(raw_context_items)) {
    return null;
  }

  const context_items_data = build_without_codeblock_depth_zero_context_items(raw_context_items);
  const context_items = Object.values(context_items_data);
  if (!context_items.length) {
    return null;
  }

  const suggestion = create_suggestion_entry(0, 'without_codeblock');
  context_items.forEach((item_data) => {
    add_item_to_suggestion(suggestion, item_data);
  });

  return suggestion;
}

/**
 * @param {{ count?: number, size?: number }} left
 * @param {{ count?: number, size?: number }} right
 * @returns {boolean}
 */
function depth_suggestions_differ(left, right) {
  return Number(left?.count || 0) !== Number(right?.count || 0)
    || Number(left?.size || 0) !== Number(right?.size || 0)
  ;
}
