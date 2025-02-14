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
 * an approximate token count and text snippet. On selection, the item is
 * compiled with that depth and copied to clipboard.
 */
export class LinkDepthModal extends SuggestModal {
  /**
   * @param {import("obsidian").App} app
   * @param {import("./main").default} plugin
   * @param {any} sc_item - The SmartContext item to compile
   * @param {number[]} depth_range - e.g. [0,1,2,3,4,5]
   */
  constructor(app, plugin, sc_item, depth_range = [0,1,2,3,4,5]) {
    super(app);
    this.plugin = plugin;
    this.sc_item = sc_item;
    this.depth_range = depth_range;

    /** @type {DepthInfo[]} */
    this.depths_info = [];

    this.setPlaceholder('Pick a link depth...');
  }

  async onOpen() {
    // 1) Always compute depth=0 fresh
    const { context: zeroContext, stats: zeroStats } =
      await this.sc_item.compile({ link_depth: 0 });
    const zeroTokens = approximate_tokens(zeroStats.char_count);

    // 2) Access existing cache from sc_item.meta.depth_cache
    //    We'll store { depth0_token_count, depths_info } there.
    const cache = this.sc_item?.meta?.depth_cache || null;
    const isCacheValid = cache && (cache.depth0_token_count === zeroTokens);

    // 3) If cache is valid, reuse. Otherwise, recalc everything
    if (isCacheValid) {
      // Reuse entire array of DepthInfo from cache
      this.depths_info = cache.depths_info;
    } else {
      // Clear old cache if any
      if (this.sc_item?.meta) {
        this.sc_item.meta.depth_cache = null;
      }
      this.depths_info = [];

      let stopFurther = false;
      for (const d of this.depth_range) {
        if (stopFurther) {
          // We add a placeholder "Not calculated" item
          this.depths_info.push({
            depth: d,
            label: `Depth ${d} (not calculated)`,
            token_count: 0,
            context: '',
            stats: {},
          });
          continue;
        }

        const { context, stats } = await this.sc_item.compile({ link_depth: d });
        const tokens = approximate_tokens(stats.char_count);
        let label = `Depth ${d} (${Math.round(stats.char_count/1000)}k chars, ${Math.round(tokens/1000)}k tokens)`;
        if (tokens > 50000) {
          label += ' [exceeds 50k; stopping further]';
          stopFurther = true;
        }
        this.depths_info.push({
          depth: d,
          label,
          token_count: tokens,
          context,
          stats,
        });
      }

      // Store new cache
      if (this.sc_item?.meta) {
        this.sc_item.meta.depth_cache = {
          depth0_token_count: zeroTokens,
          depths_info: this.depths_info,
        };
      }
    }

    super.onOpen();
  }

  /**
   * The suggestions to display (one per depth).
   */
  getSuggestions(query) {
    // We won't do fuzzy filtering by the user query,
    // just show all depths in order.
    return this.depths_info;
  }

  renderSuggestion(item, el) {
    el.createDiv({ text: item.label });
  }

  /**
   * Called when user picks a depth info item.
   * Already compiled => just copy `item.context`.
   */
  async onChooseSuggestion(item) {
    if (!item.context) {
      new Notice('No context was calculated for that depth.');
      return;
    }
    await this.plugin.copy_to_clipboard(item.context);
    this.plugin.showStatsNotice(
      item.stats,
      `Depth ${item.depth} selected`
    );
    new Notice('Copied context to clipboard!');
  }
}
