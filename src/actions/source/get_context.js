/**
 * @file source_get_context.js
 * @description
 * Build or update a SmartContext for a given SmartSource, including all
 * linked sources up to a configurable depth. The SmartContext key is the
 * same as the root source key.
 */

import {
  get_links_to_depth,
} from 'smart-sources/actions/get_links_to_depth.js';
import {
  LINK_DIRECTIONS,
  build_context_items_from_graphs,
  includes_inlinks,
  includes_outlinks,
  normalize_link_direction,
} from '../../utils/link_graph_context_items.js';

export { build_context_items_from_graphs } from '../../utils/link_graph_context_items.js';

/**
 * Build or update a SmartContext for a given source, including link graph
 * up to a given depth. The SmartContext key is equal to the source key.
 *
 * @param {object} [params={}]
 * @param {'out'|'in'|'both'} [params.direction='both'] - Link direction(s).
 * @param {boolean} [params.include_self=true] - Include the root source.
 * @param {number} [params.link_depth=5] - Maximum link depth, from 0 through 5.
 * @param {Record<string, Array<object>>} [params.outlinks_by_source] - Transient outlinks keyed by source key.
 * @returns {Promise<import('smart-contexts').SmartContext|null>}
 */
export async function source_get_context(params = {}) {
  const link_depth = params.link_depth === undefined
    ? 5
    : params.link_depth
  ;
  if (
    !Number.isInteger(link_depth)
    || link_depth < 0
    || link_depth > 5
  ) {
    throw new TypeError('link_depth must be an integer from 0 through 5.');
  }

  const direction = normalize_link_direction(params.direction);
  const include_self =
    typeof params.include_self === 'boolean' ? params.include_self : true
  ;

  const outlink_graph = includes_outlinks(direction)
    ? await get_links_to_depth(this, link_depth, {
      direction: LINK_DIRECTIONS.OUT,
      include_self,
      outlinks_by_source: params.outlinks_by_source,
    })
    : []
  ;
  const inlink_graph = includes_inlinks(direction)
    ? await get_links_to_depth(this, link_depth, {
      direction: LINK_DIRECTIONS.IN,
      include_self,
    })
    : []
  ;

  const context_items = build_context_items_from_graphs({
    outlink_graph,
    inlink_graph,
    root_source: this,
    include_root: include_self,
  });

  const smart_contexts = this.env.smart_contexts;
  const context_key = this.key;

  if (params.link_depth !== undefined) {
    const current_context =
      smart_contexts.get?.(context_key)
      || smart_contexts.items?.[context_key]
    ;
    Object.entries(current_context?.data?.context_items || {})
      .forEach(([key, item]) => {
        if (item?.link === true) {
          delete current_context.data.context_items[key];
        }
      })
    ;
  }

  if (context_items[this.key]) {
    context_items[this.key].current = true;
  }

  const smart_context = await smart_contexts.create_or_update({
    key: context_key,
    context_items,
  });

  this.once_event('sources:imported', () => {
    if (smart_contexts.items[context_key]) delete smart_contexts.items[context_key];
    // console.log(`Invalidated SmartContext cache for source ${context_key}`);
  });

  return smart_context || null;
}

export default {
  source_get_context,
};
