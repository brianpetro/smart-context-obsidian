import { get_block_display_name } from 'smart-blocks/utils/get_block_display_name.js';

/**
 * Build a content snippet for display.
 *
 * @param {string} content
 * @param {number} [max=100]
 * @returns {string}
 */
function create_snippet(content, max = 100) {
  let truncated = content.replace(/\n/g, ' ').replace(/[^A-Za-z0-9\.,]/g, ' ');
  if (truncated.length > max) {
    const half = Math.floor((max - 3) / 2);
    truncated = truncated.slice(0, half) + '...' + truncated.slice(truncated.length - half);
  }
  return truncated;
}

function get_all_blocks(source) {
  const entries = Object.entries(source?.data?.blocks || {});
  const blocks = entries.map(([key, value]) => {
    key = source.key + key;
    const existing = source.env.smart_blocks.get(key);
    if (existing) return existing;
    const block = new source.env.smart_blocks.item_type(source.env, { key, lines: value });
    source.env.smart_blocks.set(block);
    return block;
  });
  return blocks;
}

/**
 * Create suggestion entries for all blocks in a source.
 *
 * @param {Object} source
 * @returns {Promise<Array<{item: Object, path: string}>>}
 */
export async function get_block_suggestions(source) {
  const blocks = get_all_blocks(source);
  const suggestions = [];
  for (const block of blocks) {
    let display_text = get_block_display_name(block.key);
    const content = await block.read();
    const snippet = create_snippet(content);
    if (snippet) {
      display_text += (display_text.endsWith(' ') ? '' : ': ') + snippet + ` (${content.length} chars)`;
    }
    suggestions.push({
      item: block,
      path: display_text,
    });
  }
  return suggestions;
}
