/**
 * @file link_depth_modal.js
 * @description Modal prompting user for link depth (0..N). Renders token count for each option.
 * Implements caching logic:
 *  - Always recalc depth=0 on open.
 *  - Compare new depth=0 token count with cache.
 *  - If changed, discard cache and re-run compiles for all depths.
 *  - If same, re-use cached results.
 */

import { SuggestModal, Notice } from 'obsidian';

/**
 * Approximate tokens by dividing char_count by 4.
 * @param {number} charCount
 * @returns {number} approximate token count
 */
function approximate_tokens(charCount) {
  return Math.ceil(charCount / 4);
}

/**
 * @typedef DepthInfo
 * @property {number} depth
 * @property {string} label
 * @property {number} token_count
 * @property {string} context
 * @property {Object} stats
 */

/**
 * A simple SuggestModal that displays link depth options (0..N), along with
 * an approximate token count. On selection, the item is compiled with that
 * depth and copied to clipboard.
 */
export class LinkDepthModal extends SuggestModal {
  /**
   * @param {import("obsidian").Plugin} plugin
   * @param {any[]} base_items - An array of TFiles or similar, each with a .path
   * @param {number[]} depth_range - e.g. [0,1,2,3,4,5]
   */
  constructor(plugin, base_items, depth_range = [0,1,2,3,4,5]) {
    super(plugin.app);
    this.plugin = plugin;
    this.env = plugin.env;
    this.base_items = base_items;
    this.depth_range = depth_range;

    /** @type {DepthInfo[]} */
    this.depths_info = [];

    this.setPlaceholder('Pick a link depth...');
  }

  async onOpen() {
    // Gather base items into a single SmartContext item
    const context_items = {};
    for (const p of this.base_items) {
      context_items[p.path] = true;
    }
    const sc_item = this.env.smart_contexts.create_or_update({ context_items });

    // 1) Always compute depth=0 fresh
    const { context: zeroContext, stats: zeroStats } = await sc_item.compile({ link_depth: 0, calculating: true });
    this.zero_char_count = zeroStats.char_count;
    this.zero_tokens = approximate_tokens(this.zero_char_count);

    // 2) Access existing cache from sc_item.meta.depth_cache
    //    We'll store { depth0_token_count, depths_info } there.
    const cache = sc_item?.meta?.depth_cache || null;
    const isCacheValid = cache && (cache.depth0_token_count === this.zero_tokens);

    // 3) If cache is valid, reuse. Otherwise, recalc
    if (isCacheValid) {
      this.depths_info = cache.depths_info;
    } else {
      if (sc_item?.meta) {
        sc_item.meta.depth_cache = null;
      }
      this.depths_info = [];

      let stopFurther = false;
      for (const d of this.depth_range) {
        if (stopFurther) {
          // Add a placeholder for further depths
          this.depths_info.push({
            depth: d,
            label: `Depth ${d} (not calculated)`,
            token_count: 0,
            sc_item,
            stats: {}
          });
          continue;
        }

        const { stats } = await sc_item.compile({ link_depth: d, calculating: true });
        const total_chars = stats.char_count;
        const total_tokens = approximate_tokens(total_chars);

        const chars = total_chars > 10000 ? `${Math.round(total_chars / 1000)}k` : total_chars;
        const tokens = total_tokens > 10000 ? `${Math.round(total_tokens / 1000)}k` : total_tokens;
        let label = `Depth ${d} (${chars} chars, ${tokens} tokens)`;
        if (total_tokens > 50000) {
          label += ' [exceeds 50k; stopping further]';
          stopFurther = true;
        }

        this.depths_info.push({
          depth: d,
          label,
          token_count: tokens,
          sc_item,
          stats
        });
      }

      if (sc_item?.meta) {
        sc_item.meta.depth_cache = {
          depth0_token_count: this.zero_tokens,
          depths_info: this.depths_info
        };
      }
    }

    super.onOpen();
  }

  /**
   * The suggestions to display (one per depth).
   * @param {string} _query
   */
  getSuggestions(_query) {
    // We ignore user query and show all depths in order
    return this.depths_info;
  }

  /**
   * Renders each depth option in the suggestion list.
   * @param {DepthInfo} item
   * @param {HTMLElement} el
   */
  renderSuggestion(item, el) {
    el.createDiv({ text: item.label });
  }

  /**
   * Called when user picks a depth info item.
   * Re-compile at that depth and copy result to clipboard.
   * @param {DepthInfo} item
   */
  async onChooseSuggestion(item) {
    const { context, stats } = await item.sc_item.compile({ link_depth: item.depth });
    await this.plugin.copy_to_clipboard(context);

    this.plugin.showStatsNotice(stats, `Depth ${item.depth} selected`);
    new Notice('Copied context to clipboard!');
  }
}
