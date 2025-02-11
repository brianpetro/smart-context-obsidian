/**
 * @file link_depth_modal.js
 * @description Modal prompting user for link depth (0..N). Renders token count for each option.
 * Stops calculation once we exceed 50k tokens for a given depth.
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
   * @param {any} sc_item - The SmartContext item to compile at different depths
   * @param {number[]} depth_range - E.g. [0,1,2,3,4,5]
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
    // Pre-calculate compile results for each depth,
    // stop if we exceed 50k tokens at any point.
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

      // compile
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
   * We already have context compiled, so just copy.
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
