import { is_text_file } from "smart-file-system/utils/ignore.js";
/**
 * @param {object} [params={}]
 * @param {Record<string, object>} [params.context_items]
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
    if (!item_data) return;
    if (item_data.named_context) {
      entries.push('ctx:: ' + item_data.key || item_key);
      return;
    }
    if (item_key.startsWith('external:')) {
      const external_key = item_key.replace(/^external:/, '');
      if (item_data.folder === true && is_text_file(item_key)) {
        entries.push(external_key + '/'); // handle folders that look like files by adding trailing slash
      } else {
        entries.push(external_key);
      }
      return;
    }
    entries.push(item_key);
  });

  // add exclusions
  Object.entries(exclusions).forEach(([exclusion_key, exclusion_data]) => {
    entries.push('!' + exclusion_key);
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

export default build_codeblock_entries;
