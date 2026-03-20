import { parse_codeblock_to_context_items } from '../utils/parse_codeblock_to_context_items.js';
import { register_context_codeblock_processors } from '../utils/register_context_codeblock_processors.js';

/**
 * Register markdown processors for context codeblock aliases.
 *
 * Core keeps external-style lines as passthrough so unsupported entries are
 * preserved even when the block is rewritten.
 *
 * @param {object} plugin
 * @returns {void}
 */
export function register_smart_context_codeblock(plugin) {
  register_context_codeblock_processors(plugin, {
    parse_codeblock: (cb_content, { env }) => {
      return parse_codeblock_to_context_items(cb_content, {
        smart_contexts: env.smart_contexts,
      });
    },
  });
}
