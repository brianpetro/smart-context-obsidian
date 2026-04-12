import { normalize_string, get_basename, format_ymd } from '../../utils/pure_utils.js';

/**
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params={}]
 * @returns {import('smart-contexts').SmartContext|null}
 */
export function context_convert_to_named(params = {}) {
  const named_ctx = this.collection.new_context({});
  copy_context_items_data.call(this, named_ctx);
  finalize_named_context.call(this, params, named_ctx);
  this.emit_event('context:updated', {
    message: 'Created named context ' + named_ctx.name,
    context_name: named_ctx.name,
  });
  if (params.open_selector !== false) {
    named_ctx?.emit_event?.('context_selector:open');
  }
  return named_ctx;
}


export function finalize_named_context(params, named_ctx) {
  const source_path = params.source_path || this?.key?.replace(/#codeblock$/, '') || '';
  if (this.key.endsWith('#codeblock')) {
    named_ctx.data.codeblock_inclusions = { [source_path]: Date.now() };
  }
  const context_name = normalize_string(
    params.context_name
    || build_default_named_context_name(source_path, this.collection, params)
  );
  named_ctx.name = context_name; // triggers name event
  this.data.context_items = {
    [named_ctx.name]: {
      key: named_ctx.name,
      named_context: true,
    }
  };
}

/**
 * @this {import('smart-contexts').SmartContext}
 * @param {import('smart-contexts').SmartContext} named_ctx
 * @returns {void}
 */
export function copy_context_items_data(named_ctx) {
  const ctx_named_context_entries = this.named_contexts.map((named_ctx) => Object.entries(named_ctx.data.context_items || {})).flat();
  const ctx_other_context_entries = Object.entries(this.data.context_items || {}).filter(([key, item_data]) => !item_data.named_context);
  const all_entries = [...ctx_named_context_entries, ...ctx_other_context_entries];
  named_ctx.data.context_items = Object.fromEntries(all_entries);
}

/**
 * @param {import('smart-contexts').SmartContexts} smart_contexts
 * @returns {Set<string>}
 */
function get_existing_context_names(smart_contexts) {
  const names = new Set();
  const items = smart_contexts?.items ? Object.values(smart_contexts.items) : [];

  items.forEach((item) => {
    const name = normalize_string(item?.data?.name);
    if (!name) return;
    names.add(name.toLowerCase());
  });

  return names;
}

/**
 * @param {string} base_name
 * @param {Set<string>} existing_names
 * @returns {string}
 */
function build_unique_context_name(base_name, existing_names) {
  const normalized_base_name = normalize_string(base_name) || 'Context';
  if (!existing_names.has(normalized_base_name.toLowerCase())) {
    return normalized_base_name;
  }

  let suffix = 2;
  let next_name = `${normalized_base_name} ${suffix}`;

  while (existing_names.has(next_name.toLowerCase())) {
    suffix += 1;
    next_name = `${normalized_base_name} ${suffix}`;
  }

  return next_name;
}

/**
 * @param {string} source_path
 * @param {import('smart-contexts').SmartContexts} smart_contexts
 * @param {object} [params={}]
 * @param {Date} [params.now]
 * @returns {string}
 */
function build_default_named_context_name(source_path, smart_contexts, params = {}) {
  const now = params.now instanceof Date ? params.now : new Date();
  const base_name = `${get_basename(source_path)} ${format_ymd(now)}`;
  return build_unique_context_name(base_name, get_existing_context_names(smart_contexts));
}

export const version = '1.0.0';