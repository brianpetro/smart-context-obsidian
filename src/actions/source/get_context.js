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
 * Depth handling:
 *  - Start with the graph-reported depth.
 *  - If the linked item appears as an embedded outlink on the root source
 *    (the SmartSource that invoked source_get_context), treat it as depth 0
 *    so it is considered part of the root note.
 *
 * @param {Array<{ depth:number, item:import('smart-sources').SmartSource }>} graph
 * @param {import('smart-sources').SmartSource|null} [root_source]
 * @returns {Record<string, { d:number, mtime?:number, size?:number }>}
 */
function build_context_items_from_graph(graph = [], root_source = null) {
  /** @type {Record<string, { d:number, mtime?:number, size?:number }>} */
  const context_items = {};

  const root_outlinks = Array.isArray(root_source?.data?.outlinks)
    ? root_source.data.outlinks
    : null;

  for (const entry of graph) {
    if (!entry || !entry.item) continue;

    const item = entry.item;
    const key = item.key;
    if (!key) continue;

    const graph_depth = typeof entry.depth === "number" ? entry.depth : 0;
    let depth = graph_depth;

    // Override depth for direct embedded outlinks from the root source.
    // Pseudocode requirement:
    // if (this.data.outlinks[].find(o => linked_key.endsWith(o.target)).embedded === true) d = 0
    if (
      root_outlinks &&
      graph_depth > 0 && // root itself (depth 0) is already correct
      typeof key === "string"
    ) {
      const embedded_outlink = root_outlinks.find((o) => {
        if (!o || typeof o !== "object") return false;
        const target = typeof o.target === "string" ? o.target : null;
        if (!target) return false;
        if (!key.endsWith(target)) return false;
        return o.embedded === true;
      });

      if (embedded_outlink) {
        depth = 0;
      }
    }

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
      link: true,
    };
  }

  return context_items;
}

/**
 * Build or update a SmartContext for a given source, including link graph
 * up to a given depth. The SmartContext key is equal to the source key.
 *
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

  const context_items = build_context_items_from_graph(graph, this);

  const smart_contexts = this.env.smart_contexts;
  const context_key = this.key;

  const smart_context = await smart_contexts.create_or_update({
    key: context_key,
    context_items,
  });
  this.once_event('sources:imported', () => {
    if(smart_contexts.items[context_key]) delete smart_contexts.items[context_key];
    console.log(`Invalidated SmartContext cache for source ${context_key}`);
  });

  return smart_context || null;
}

export default {
  source_get_context,
};
