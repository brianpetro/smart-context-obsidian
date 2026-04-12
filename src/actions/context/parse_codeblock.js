import { murmur_hash_32_alphanumeric } from 'smart-utils/create_hash.js';

/**
 * Parse codeblock content into context items, named contexts, and passthrough lines.
 * 
 * @this {import('../items/smart_context.js').SmartContext}
 * @param {object} params
 * @param {string} params.cb_content
 * 
 */
export function context_parse_codeblock(params = {}) {
  const { cb_content } = params;
  if (typeof cb_content !== 'string') {
    this.emit_error_event('context_codeblock:parse', { message: 'Codeblock content must be a string' });
    return;
  }
  const new_hash = murmur_hash_32_alphanumeric(cb_content);
  if (this._cb_hash === new_hash) {
    return;
  }
  this?._update_disposer?.();
  this._update_disposer = null;
  this._cb_hash = new_hash;
  this.data.context_items = {};
  const context_lines = cb_content.split('\n').map((line) => line.trim()).filter((line) => line);
  for (let i = 0; i < context_lines.length; i += 1) {
    const line = context_lines[i];
    const item_data = parse_codeblock_line(line);
    this.data.context_items[item_data.key] = item_data;
  }
  console.log('context_parse_codeblock', { context_lines });
}

export function parse_codeblock_line(line) {
  const item_data = { key: line };
  if (item_data.key.startsWith('ctx:: ')) {
    item_data.key = `${item_data.key.slice(6).trim()}`;
    item_data.named_context = true;
  }
  return item_data;
}


export const version = '1.0.0';