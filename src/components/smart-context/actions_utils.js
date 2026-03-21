import {
  convert_codeblock_to_named_context,
} from '../../utils/context_codeblock_utils.js';
import { is_codeblock_context_key } from '../../utils/pure_utils.js';
import { get_named_context } from '../../utils/named_context_utils.js';

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {string}
 */
export function get_context_name_input_value(ctx) {
  if (is_codeblock_context_key(ctx?.key)) {
    const codeblock_named_contexts = Array.isArray(ctx?.data?.codeblock_named_contexts)
      ? ctx.data.codeblock_named_contexts.filter(Boolean)
      : []
    ;
    if (codeblock_named_contexts.length === 1) {
      return String(codeblock_named_contexts[0]).trim();
    }
  }

  return String(ctx?.data?.name ?? '').trim();
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {import('smart-contexts').SmartContext|null}
 */
function get_linked_named_context(ctx) {
  if (!is_codeblock_context_key(ctx?.key)) return null;

  const context_name = get_context_name_input_value(ctx);
  if (!context_name) return null;

  return get_named_context(ctx?.env?.smart_contexts, context_name);
}

/**
 * Keep codeblock proxy state aligned immediately after a linked named context
 * rename initiated from the builder input.
 *
 * Global rename sync still handles note text and any other hydrated codeblocks.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {string} old_name
 * @param {string} next_name
 * @returns {void}
 */
function sync_local_codeblock_proxy_name(ctx, old_name, next_name) {
  if (!is_codeblock_context_key(ctx?.key)) return;
  if (!old_name || !next_name || old_name === next_name) return;

  const codeblock_named_contexts = Array.isArray(ctx?.data?.codeblock_named_contexts)
    ? ctx.data.codeblock_named_contexts
    : []
  ;

  ctx.data.codeblock_named_contexts = codeblock_named_contexts.map((context_name) => {
    return context_name === old_name ? next_name : context_name;
  });

  Object.values(ctx?.data?.context_items || {}).forEach((item_data) => {
    if (item_data?.from_named_context !== old_name) return;
    item_data.from_named_context = next_name;
  });
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

  const linked_named_ctx = get_linked_named_context(ctx);
  if (linked_named_ctx) {
    if (!next_name || next_name === current_name) {
      return {
        changed: false,
        context_name: current_name,
        named_ctx: linked_named_ctx,
      };
    }

    linked_named_ctx.name = next_name;
    sync_local_codeblock_proxy_name(ctx, current_name, next_name);

    return {
      changed: true,
      context_name: next_name,
      named_ctx: linked_named_ctx,
      action: 'renamed',
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
