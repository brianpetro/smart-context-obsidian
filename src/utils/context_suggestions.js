/**
 * Build suggestion entries for each depth, with and without inlinks.
 *
 * @param {Array<{ data?: { d?: number, inlink?: boolean }, size?: number }>} ctx_items
 * @returns {Array<{ d:number, count:number, size:number, sizes:number, include_inlinks:boolean }>}
 */
export function build_depth_suggestions(ctx_items = []) {
  if (!Array.isArray(ctx_items)) {
    return [];
  }

  const depth_values = ctx_items
    .map((item) => (typeof item?.data?.d === 'number' ? item.data.d : null))
    .filter((depth) => typeof depth === 'number');

  if (depth_values.length === 0) {
    return [];
  }

  const max_depth = Math.max(...depth_values);

  const suggestions_by_depth = Array.from({ length: max_depth + 1 }, (_, depth) => ({
    depth,
    outlinks_only: create_suggestion_entry(depth, false),
    include_inlinks: create_suggestion_entry(depth, true),
  }));

  for (const item of ctx_items) {
    const item_depth = typeof item?.data?.d === 'number' ? item.data.d : null;
    if (item_depth === null) {
      continue;
    }

    for (let depth = item_depth; depth <= max_depth; depth += 1) {
      const bucket = suggestions_by_depth[depth];
      if (!bucket) {
        continue;
      }
      add_item_to_suggestion(bucket.include_inlinks, item);
      if (!item?.data?.inlink) {
        add_item_to_suggestion(bucket.outlinks_only, item);
      }
    }
  }

  return suggestions_by_depth.flatMap((bucket) => [
    bucket.outlinks_only,
    bucket.include_inlinks,
  ]);
}

/**
 * @param {number} depth
 * @param {boolean} include_inlinks
 * @returns {{ d:number, count:number, size:number, sizes:number, include_inlinks:boolean }}
 */
function create_suggestion_entry(depth, include_inlinks) {
  return {
    d: depth,
    count: 0,
    size: 0,
    sizes: 0,
    include_inlinks,
  };
}

/**
 * @param {{ count:number, size:number, sizes:number }} suggestion
 * @param {{ size?: number }} item
 * @returns {void}
 */
function add_item_to_suggestion(suggestion, item) {
  suggestion.count += 1;
  if (typeof item?.size === 'number' && item.size > 0) {
    suggestion.size += item.size;
    suggestion.sizes += 1;
  }
}
