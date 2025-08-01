import { get_block_display_name } from 'smart-blocks/utils/get_block_display_name.js';

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

export async function get_block_suggestions(source) {
  const blocks = get_all_blocks(source);
  const suggestions = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    let display_text = get_block_display_name(block.key);
    if (block.key.endsWith('}')) {
      const content = await block.read();
      // middle truncate the content to 100 characters
      const max = 100;
      let truncated = content.replace(/\n/g, ' ').replace(/[^A-Za-z0-9\.,]/g, ' ');
      if (truncated.length > max) {
        const half = Math.floor((max - 3) / 2);
        truncated = truncated.slice(0, half) + '...' + truncated.slice(truncated.length - half);
      }
      display_text += (display_text.endsWith(' ') ? '' : ': ') + truncated + ` (${content.length} chars)`;
    }
    suggestions.push({
      item: block,
      path: display_text,
    });
  }
  return suggestions;
}
