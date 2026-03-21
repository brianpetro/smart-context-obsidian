import {
  build_internal_codeblock_exclusions,
  build_internal_folder_context_items,
  is_internal_folder_path,
  resolve_internal_source_key,
} from './codeblock_folder_utils.js';
import {
  consume_named_context_line,
  create_codeblock_parse_state,
  finalize_codeblock_parse_state,
  get_codeblock_context_lines,
} from './codeblock_parse_state.js';

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
  const context_lines = get_codeblock_context_lines(cb_content);
  const internal_exclusions = build_internal_codeblock_exclusions(context_lines, smart_sources);

  const state = create_codeblock_parse_state(cb_content, {
    context_lines,
    smart_contexts,
    internal_exclusions,
  });

  for (let i = 0; i < context_lines.length; i += 1) {
    const line = context_lines[i];

    if (consume_named_context_line(state, line)) {
      continue;
    }

    if (line.startsWith('../') || line.startsWith('!../')) {
      state.passthrough_lines.push(line);
      continue;
    }

    if (line.startsWith('!')) {
      continue;
    }

    const source_key = resolve_internal_source_key(smart_sources, line);
    if (source_key) {
      state.add_context_items([{ key: source_key }]);
      continue;
    }

    if (is_internal_folder_path(line, smart_sources)) {
      state.add_context_items(build_internal_folder_context_items(line, smart_sources));
      continue;
    }

    state.add_context_items([{ key: line }]);
  }

  return finalize_codeblock_parse_state(state);
}

export default parse_codeblock_to_context_items;
