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
 * @returns {Promise<import('smart-contexts').SmartContext|null>}
 */
export async function source_get_context(params = {}) {
  const LINK_DEPTH = 5;
  const direction = normalize_link_direction(params.direction);
  const include_self =
    typeof params.include_self === 'boolean' ? params.include_self : true
  ;

  const outlink_graph = includes_outlinks(direction)
    ? await get_links_to_depth(this, LINK_DEPTH, {
      direction: LINK_DIRECTIONS.OUT,
      include_self,
    })
    : []
  ;
  const inlink_graph = includes_inlinks(direction)
    ? await get_links_to_depth(this, LINK_DEPTH, {
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

  const smart_context = await smart_contexts.create_or_update({
    key: context_key,
    context_items,
  });

  this.once_event('sources:imported', () => {
    if (smart_contexts.items[context_key]) delete smart_contexts.items[context_key];
    console.log(`Invalidated SmartContext cache for source ${context_key}`);
  });

  return smart_context || null;
}

export default {
  source_get_context,
};
