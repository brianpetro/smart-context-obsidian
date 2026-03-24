import { murmur_hash_32_alphanumeric } from 'smart-utils/create_hash.js';
import {
  normalize_codeblock_path,
  should_exclude_codeblock_item,
} from './codeblock_folder_utils.js';
import {
  get_named_context_items,
  parse_named_context_line,
} from './named_context_utils.js';

/**
 * Normalize raw codeblock contents into trimmed, non-empty lines.
 *
 * @param {string} cb_content
 * @returns {string[]}
 */
export function get_codeblock_context_lines(cb_content = '') {
  return String(cb_content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  ;
}

/**
 * Build shared parse state for Core and Pro codeblock parsers.
 *
 * The state owns:
 * - `context_items`
 * - `named_contexts`
 * - `passthrough_lines`
 * - active-item dedupe
 * - exclusion-aware item adding
 *
 * @param {string} cb_content
 * @param {object} [deps={}]
 * @param {string[]} [deps.context_lines]
 * @param {import('smart-contexts').SmartContexts} [deps.smart_contexts]
 * @param {object} [deps.internal_exclusions]
 * @returns {{
 *   cb_hash: string,
 *   context_lines: string[],
 *   smart_contexts: import('smart-contexts').SmartContexts|undefined,
 *   internal_exclusions: object,
 *   context_items: Array<object>,
 *   named_contexts: string[],
 *   passthrough_lines: string[],
 *   seen_active_keys: Set<string>,
 *   add_context_items: (items?: Array<object>) => void,
 * }}
 */
export function create_codeblock_parse_state(cb_content, deps = {}) {
  const context_lines = Array.isArray(deps.context_lines)
    ? deps.context_lines
    : get_codeblock_context_lines(cb_content)
  ;

  const internal_exclusions = deps.internal_exclusions || {};

  const state = {
    cb_hash: murmur_hash_32_alphanumeric(cb_content),
    context_lines,
    smart_contexts: deps.smart_contexts,
    internal_exclusions,
    context_items: [],
    named_contexts: [],
    passthrough_lines: [],
    seen_active_keys: new Set(),
    add_context_items(items = []) {
      items.forEach((item_data) => {
        const item_key = normalize_codeblock_path(item_data?.key || item_data?.path);
        if (!item_key) return;
        if (state.seen_active_keys.has(item_key)) return;
        if (should_exclude_codeblock_item(item_key, state.internal_exclusions)) return;

        state.seen_active_keys.add(item_key);
        state.context_items.push({
          ...item_data,
          key: item_key,
        });
      });
    },
  };

  return state;
}

/**
 * Consume one named-context line into shared parse state.
 *
 * @param {ReturnType<typeof create_codeblock_parse_state>} state
 * @param {string} line
 * @returns {boolean}
 */
export function consume_named_context_line(state, line = '') {
  const named_context = parse_named_context_line(line);
  if (!named_context) return false;

  state.named_contexts.push(named_context);
  state.add_context_items(
    get_named_context_items(named_context, state.smart_contexts),
  );

  return true;
}

/**
 * Finalize shared parse state into the public parser payload shape.
 *
 * Exclusions are appended last so they overwrite matching active entries when
 * the hydrated SmartContext map is rebuilt.
 *
 * @param {ReturnType<typeof create_codeblock_parse_state>} state
 * @param {object} [params={}]
 * @returns {{
 *   cb_hash: string,
 *   context_items: Array<object>,
 *   named_contexts: string[],
 *   passthrough_lines: string[],
 * } & Record<string, unknown>}
 */
export function finalize_codeblock_parse_state(state, params = {}) {
  const excluded_items = Array.isArray(state?.internal_exclusions?.excluded_items)
    ? state.internal_exclusions.excluded_items
    : []
  ;

  if (excluded_items.length) {
    state.context_items.push(...excluded_items);
  }

  return {
    cb_hash: state.cb_hash,
    context_items: state.context_items,
    named_contexts: [...new Set(state.named_contexts)],
    passthrough_lines: [...new Set((state.passthrough_lines || []).filter(Boolean))],
    ...params,
  };
}
