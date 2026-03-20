import { murmur_hash_32_alphanumeric } from 'smart-utils/create_hash.js';
import {
  build_internal_codeblock_exclusions,
  build_internal_folder_context_items,
  is_internal_folder_path,
  normalize_codeblock_path,
  resolve_internal_source_key,
  should_exclude_codeblock_item,
} from './codeblock_folder_utils.js';
import {
  get_named_context_items,
  parse_named_context_line,
} from './named_context_utils.js';

/**
 * Convert core codeblock contents into context items.
 *
 * Core preserves unsupported external-style lines as passthrough so
 * they are not destroyed by managed rewrites.
 *
 * Folder lines are expanded into concrete source items while each expanded
 * item retains its originating `folder` path so rewrites can collapse back to
 * a single folder line.
 *
 * @param {string} cb_content
 * @param {object} deps
 * @param {import('smart-contexts').SmartContexts} [deps.smart_contexts]
 * @param {object} [deps.smart_sources]
 * @returns {{
 *   cb_hash: string,
 *   context_items: Array<object>,
 *   named_contexts: string[],
 *   passthrough_lines: string[],
 * }}
 */
export function parse_codeblock_to_context_items(cb_content, deps = {}) {
  const smart_contexts = deps.smart_contexts;
  const smart_sources = deps.smart_sources;
  const cb_hash = murmur_hash_32_alphanumeric(cb_content);
  const context_lines = String(cb_content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  ;

  const exclusions = build_internal_codeblock_exclusions(context_lines, smart_sources);

  /** @type {Array<object>} */
  const context_items = [];
  /** @type {string[]} */
  const named_contexts = [];
  /** @type {string[]} */
  const passthrough_lines = [];
  const seen_active_keys = new Set();

  /**
   * @param {Array<object>} items
   * @returns {void}
   */
  const add_context_items = (items = []) => {
    items.forEach((item_data) => {
      const item_key = normalize_codeblock_path(item_data?.key || item_data?.path);
      if (!item_key) return;
      if (seen_active_keys.has(item_key)) return;
      if (should_exclude_codeblock_item(item_key, exclusions)) return;

      seen_active_keys.add(item_key);
      context_items.push({
        ...item_data,
        key: item_key,
        ctx_codeblock: true,
      });
    });
  };

  for (let i = 0; i < context_lines.length; i += 1) {
    const line = context_lines[i];
    const named_context = parse_named_context_line(line);
    if (named_context) {
      named_contexts.push(named_context);
      add_context_items(get_named_context_items(named_context, smart_contexts));
      continue;
    }

    if (line.startsWith('../') || line.startsWith('!../')) {
      passthrough_lines.push(line);
      continue;
    }

    if (line.startsWith('!')) {
      continue;
    }

    const source_key = resolve_internal_source_key(smart_sources, line);
    if (source_key) {
      add_context_items([{ key: source_key }]);
      continue;
    }

    if (is_internal_folder_path(line, smart_sources)) {
      add_context_items(build_internal_folder_context_items(line, smart_sources));
      continue;
    }

    add_context_items([{ key: line }]);
  }

  context_items.push(...exclusions.excluded_items);

  return {
    cb_hash,
    context_items,
    named_contexts: [...new Set(named_contexts)],
    passthrough_lines,
  };
}

export default parse_codeblock_to_context_items;
