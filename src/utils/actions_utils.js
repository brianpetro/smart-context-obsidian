import {
  convert_codeblock_to_named_context,
} from './context_codeblock_utils.js';
import { is_codeblock_context_key } from './pure_utils.js';

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {string}
 */
export function get_context_name_input_value(ctx) {
  return String(ctx?.data?.name ?? '').trim();
}

/**
 * Persist a name from the builder input.
 *
 * Rules:
 * - regular contexts save to `ctx.name`
 * - codeblock contexts with an existing linked named context rename that linked
 *   named context
 * - codeblock contexts without a linked named context reuse the same data flow
 *   as "Convert to named context", but do not force-open a second selector modal
 *   unless the caller explicitly asks for it
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params]
 * @param {string} [params.input_value]
 * @param {boolean} [params.open_selector=false]
 * @returns {{changed: boolean, context_name: string, named_ctx?: import('smart-contexts').SmartContext|null, action?: string}}
 */
export function persist_context_name(ctx, params = {}) {
  const input_value = String(params.input_value ?? '');
  const next_name = input_value.trim();
  const current_name = get_context_name_input_value(ctx);

  if (!is_codeblock_context_key(ctx?.key)) {
    if (next_name === current_name) {
      return {
        changed: false,
        context_name: current_name,
      };
    }

    ctx.name = next_name;
    return {
      changed: true,
      context_name: next_name,
      named_ctx: ctx,
      action: current_name ? 'renamed' : 'named',
    };
  }

  if (!next_name || next_name === current_name) {
    return {
      changed: false,
      context_name: current_name,
    };
  }

  const named_ctx = convert_codeblock_to_named_context(ctx, {
    context_name: next_name,
    open_selector: params.open_selector === true,
  });

  return {
    changed: Boolean(named_ctx),
    context_name: next_name,
    named_ctx: named_ctx || null,
    action: 'converted',
  };
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params]
 * @param {string} [params.input_value]
 * @returns {{is_saved: boolean, label: string}}
 */
export function resolve_name_status(ctx, params = {}) {
  const input_value = String(params.input_value ?? '');
  const stored_name = get_context_name_input_value(ctx);
  const trimmed_input = input_value.trim();
  const trimmed_name = stored_name.trim();
  const is_saved = trimmed_name.length > 0 && trimmed_input === trimmed_name;
  return {
    is_saved,
    label: is_saved ? 'Saved' : '',
  };
}
