import { normalize_context_item_data } from 'smart-contexts/context_items.js';

/**
 * @param {object} [params={}]
 * @param {Record<string, object>} [params.context_items]
 * @param {Record<string, object>} [params.exclusions]
 * @param {string} [params.named_context_line_prefix]
 * @returns {string[]}
 */
export function build_codeblock_entries(params = {}) {
  const context_items = params.context_items && typeof params.context_items === 'object'
    ? params.context_items
    : {}
  ;
  const exclusions = params.exclusions && typeof params.exclusions === 'object'
    ? params.exclusions
    : {}
  ;

  /** @type {string[]} */
  const entries = [];

  // add context lines
  Object.entries(context_items).forEach(([item_key, item_data]) => {
    if (!item_data || item_data.exclude === true) return;
    const normalized_data = normalize_context_item_data(item_key, item_data);
    if (normalized_data.kind === 'named_context') {
      entries.push(`ctx:: ${normalized_data.key || item_key}`);
      return;
    }
    entries.push(get_codeblock_item_key(item_key, normalized_data));
  });

  // add exclusions
  Object.entries(exclusions).forEach(([exclusion_key, exclusion_data]) => {
    const normalized_data = normalize_context_item_data(exclusion_key, exclusion_data);
    entries.push(`!${get_codeblock_item_key(exclusion_key, normalized_data)}`);
  });

  return entries
    .filter(Boolean)
    .filter((entry, index, arr) => arr.indexOf(entry) === index)
    // sort alphabetically, number of segments, and then separate exclude items to the end
    .sort((left, right) => {
      const left_is_exclusion = left.startsWith('!');
      const right_is_exclusion = right.startsWith('!');
      if (left_is_exclusion && !right_is_exclusion) return 1;
      if (!left_is_exclusion && right_is_exclusion) return -1;
      const left_segments = left.split('/').length;
      const right_segments = right.split('/').length;
      if (left_segments !== right_segments) return left_segments - right_segments;
      return left.localeCompare(right);
    })
  ;
}

/**
 * @param {string} item_key
 * @param {object} item_data
 * @returns {string}
 */
function get_codeblock_item_key(item_key, item_data = {}) {
  let output_key = item_data.source_path || item_data.key || item_key;
  if (item_data.kind === 'block' && typeof item_data.subpath === 'string') {
    output_key = `${output_key}#${item_data.subpath}`;
  }
  if (item_data.kind === 'folder' && !output_key.endsWith('/')) {
    output_key += '/';
  }
  return output_key;
}

export default build_codeblock_entries;
