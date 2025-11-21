/**
 * @file source_get_context.js
 * @description
 * Build or update a SmartContext for a given SmartSource, including all
 * linked sources up to a configurable depth. The SmartContext key is the
 * same as the root source key.
 */

import {
  get_links_to_depth,
  LINK_DIRECTIONS,
} from "smart-sources/actions/get_links_to_depth.js";

/**
 * Build context_items payload from link traversal results.
 *
 * @param {Array<{ depth:number, item:import('smart-sources').SmartSource }>} graph
 * @returns {Record<string, { d:number, mtime?:number, size?:number }>}
 */
function build_context_items_from_graph(graph = []) {
  /** @type {Record<string, { d:number, mtime?:number, size?:number }>} */
  const context_items = {};

  for (const entry of graph) {
    if (!entry || !entry.item) continue;
    const depth = typeof entry.depth === "number" ? entry.depth : 0;
    const item = entry.item;
    const key = item.key;

    if (!key) continue;

    const existing = context_items[key] || {};

    // Ensure smallest depth wins if the same node is reached via multiple paths
    const final_depth =
      typeof existing.d === "number"
        ? Math.min(existing.d, depth)
        : depth;

    context_items[key] = {
      ...existing,
      d: final_depth,
      mtime: item.mtime,
      size: item.size,
    };
  }

  return context_items;
}

/**
 * Build or update a SmartContext for a given source, including link graph
 * up to a given depth. The SmartContext key is equal to the source key.
 *
 * @param {import('smart-environment').SmartEnv} this.env
 * @param {import('smart-sources').SmartSource|string} source_or_key
 * @param {object} [params={}]
 * @param {"out"|"in"|"both"} [params.direction="both"]  - Link direction(s).
 * @param {boolean} [params.include_self=true]           - Include the root source.
 * @param {boolean} [params.merge_context_opts=true]     - Preserve existing context_opts.
 * @returns {Promise<import('smart-contexts').SmartContext|null>}
 */
export async function source_get_context(params = {}) {
  const LINK_DEPTH = 5;
  const direction =
    params.direction && Object.values(LINK_DIRECTIONS).includes(params.direction)
      ? params.direction
      : LINK_DIRECTIONS.BOTH;

  const include_self =
    typeof params.include_self === "boolean" ? params.include_self : true;

  // Traverse the link graph using existing action.
  const graph = await get_links_to_depth(this, LINK_DEPTH, {
    direction,
    include_self,
  });

  const context_items = build_context_items_from_graph(graph);

  const smart_contexts = this.env.smart_contexts;
  const context_key = this.key;

  const smart_context = await smart_contexts.create_or_update({
    key: context_key,
    context_items,
  });

  return smart_context || null;
}

export default {
  source_get_context,
};
