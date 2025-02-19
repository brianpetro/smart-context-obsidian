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
import { parse_codeblock } from './codeblock.js';

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
    const context_items = {};
    for (const p of this.base_items) {
      context_items[p.path] = true;
    }
    const sc_item = this.env.smart_contexts.create_or_update({ context_items });
    this.external_items = {};
    this.external_char_count = 0;
    for (const p of this.base_items) {
      const base_content = await this.app.vault.cachedRead(p);
      const result = await parse_codeblock(base_content, this.app.vault.adapter.basePath);
      console.log('result', result);
      this.external_items = { ...this.external_items, ...result.items };
      this.external_char_count += result.external_chars;
    }
    console.log('external_items', this.external_items);
    // 1) Always compute depth=0 fresh
    const { context: zeroContext, stats: zeroStats } = await sc_item.compile({ link_depth: 0 });
    this.zero_char_count = zeroStats.char_count + this.external_char_count;
    this.zero_tokens = approximate_tokens(this.zero_char_count);

    // 2) Access existing cache from sc_item.meta.depth_cache
    //    We'll store { depth0_token_count, depths_info } there.
    const cache = sc_item?.meta?.depth_cache || null;
    const isCacheValid = cache && (cache.depth0_token_count === this.zero_tokens);

    // 3) If cache is valid, reuse. Otherwise, recalc everything
    if (isCacheValid) {
      // Reuse entire array of DepthInfo from cache
      this.depths_info = cache.depths_info;
    } else {
      // Clear old cache if any
      if (sc_item?.meta) {
        sc_item.meta.depth_cache = null;
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
            sc_item,
            stats: {},
          });
          continue;
        }

        const { stats } = await sc_item.compile({ link_depth: d });
        const total_chars = stats.char_count + this.external_char_count;
        const tokens = approximate_tokens(total_chars);
        let label = `Depth ${d} (${Math.round(total_chars/1000)}k chars, ${Math.round(tokens/1000)}k tokens)`;
        if (tokens > 50000) {
          label += ' [exceeds 50k; stopping further]';
          stopFurther = true;
        }
        this.depths_info.push({
          depth: d,
          label,
          token_count: tokens,
          sc_item,
          stats,
        });
      }

      // Store new cache
      if (sc_item?.meta) {
        sc_item.meta.depth_cache = {
          depth0_token_count: this.zero_tokens,
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
    const { context, stats } = await item.sc_item.compile({ link_depth: item.depth, items: this.external_items });
    await this.plugin.copy_to_clipboard(context);
    this.plugin.showStatsNotice(
      stats,
      `Depth ${item.depth} selected`
    );
    new Notice('Copied context to clipboard!');
  }
}
