import { murmur_hash_32_alphanumeric } from 'smart-utils/create_hash.js';
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
 * @param {string} cb_content
 * @param {object} deps
 * @param {import('smart-contexts').SmartContexts} [deps.smart_contexts]
 * @returns {{
 *   cb_hash: string,
 *   context_items: Array<object>,
 *   named_contexts: string[],
 *   passthrough_lines: string[],
 * }}
 */
export function parse_codeblock_to_context_items(cb_content, deps = {}) {
  const smart_contexts = deps.smart_contexts;
  const cb_hash = murmur_hash_32_alphanumeric(cb_content);
  const context_lines = String(cb_content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  ;

  /** @type {Array<object>} */
  const context_items = [];
  /** @type {string[]} */
  const named_contexts = [];
  /** @type {string[]} */
  const passthrough_lines = [];

  for (let i = 0; i < context_lines.length; i += 1) {
    const line = context_lines[i];
    const named_context = parse_named_context_line(line);
    if (named_context) {
      named_contexts.push(named_context);
      context_items.push(...get_named_context_items(named_context, smart_contexts));
      continue;
    }

    if (line.startsWith('../') || line.startsWith('!../')) {
      passthrough_lines.push(line);
      continue;
    }

    if (line.startsWith('!')) {
      const item_key = line.slice(1).trim();
      if (!item_key) continue;
      context_items.push({
        key: item_key,
        exclude: true,
        ctx_codeblock: true,
      });
      continue;
    }

    context_items.push({
      key: line,
      ctx_codeblock: true,
    });
  }

  return {
    cb_hash,
    context_items,
    named_contexts: [...new Set(named_contexts)],
    passthrough_lines,
  };
}
