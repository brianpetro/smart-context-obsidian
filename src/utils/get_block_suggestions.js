import { get_block_display_name } from 'smart-blocks/utils/get_block_display_name.js';
export async function get_block_suggestions(source) {
  const blocks = source?.blocks || [];
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
      display_text += truncated;
    }
    suggestions.push({
      item: block,
      path: display_text,
    });
  }
  return suggestions;
}
