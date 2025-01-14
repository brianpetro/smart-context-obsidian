/**
 * smart_context.js
 * 
 * @fileoverview
 * Provides the SmartContext class and its updated implementation based on the 
 * latest specs, including the new `respect_exclusions()` method that relies on 
 * `parse_blocks` logic from `smart-blocks/parsers/markdown.js`.
 */

import { CollectionItem } from 'smart-collections';
import { build_context } from './utils/build_context.js';
import { respect_exclusions } from './utils/respect_exclusions.js';
import { murmur_hash_32_alphanumeric } from '../../advanced-env/utils/create_hash.js';

/**
 * @class SmartContext
 * @extends CollectionItem
 * @classdesc Represents a single contextual set of references or file paths relevant to a user flow,
 * with updated methods to handle excluded headings logic.
 */
export class SmartContext extends CollectionItem {
  /**
   * Default data structure when creating a new SmartContext.
   * @static
   * @readonly
   */
  static get defaults() {
    return {
      data: {
        key: '',
        items: {},
      },
    };
  }

  /**
   * compile(opts = {})
   * - merges collection-level settings with provided opts
   * - loads item content
   * - follows links if link_depth>0
   * - excludes headings
   * - calls build_context
   * @async
   * @param {Object} opts - Additional options that override the collection settings.
   * @returns {Promise<Object>} The result from build_context (e.g. { context, stats }).
   */
  async compile(opts = {}) {
    // 1) Merge settings
    const merged = {
      ...this.collection.settings,
      ...opts,
      items: {},
      links: {},
    };

    // 2) Add this.data.items{} into merged.items
    for (const [some_path_or_key, flag] of Object.entries(this.data.items || {})) {
      if (!flag) continue;
      // Typically would fetch content from a source or FS. Placeholder here:
      merged.items[some_path_or_key] = `Content for ${some_path_or_key}`;
    }

    // 3) Optionally follow links up to merged.link_depth
    if (merged.link_depth > 0) {
      const discovered_links = this.get_links(merged.link_depth, merged.inlinks);
      Object.assign(merged.links, discovered_links);
    }

    // 4) Exclusions or parse blocks if desired
    await respect_exclusions(merged);

    // 5) Finally, call build_context
    const result = await build_context(merged);
    return result;
  }

  /**
   * get_links(depth, inlinks)
   * Example stub method that might parse or BFS links from items.
   * Return an object of link -> [linkedKey, linkContent, linkType?].
   * 
   * @param {number} depth - link depth to follow
   * @param {boolean} inlinks - whether to include in-links
   * @returns {Object} For example: { '/path/to/item': ['/path/to/other', 'CONTENT', 'OUT-LINK'] }
   */
  get_links(depth, inlinks = false) {
    if (!depth) return {};
    // Example: return empty object or dummy data
    // Real implementation might BFS or parse embedded references from each item
    return {};
  }
  /**
   * A key for the context, typically user-defined or auto from items. 
   * Falls back to murmur hash if none set.
   * @readonly
   */
  get key() {
    if (this.data.key) return this.data.key;
    const str = JSON.stringify(this.data.items || {});
    return murmur_hash_32_alphanumeric(str);
  }
}