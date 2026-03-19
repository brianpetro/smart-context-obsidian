import { context_named_context_prefixes } from './context_codeblock_constants.js';

/**
 * @param {string} value
 * @returns {string}
 */
export function normalize_named_context_name(value = '') {
  return String(value ?? '').trim();
}

/**
 * @param {string} line
 * @returns {string|null}
 */
export function parse_named_context_line(line = '') {
  const normalized_line = String(line || '').trim();
  if (!normalized_line) return null;

  for (let i = 0; i < context_named_context_prefixes.length; i += 1) {
    const prefix = context_named_context_prefixes[i];
    if (!normalized_line.startsWith(prefix)) continue;

    const context_name = normalize_named_context_name(
      normalized_line.slice(prefix.length),
    );
    return context_name || null;
  }

  return null;
}

/**
 * @param {import('smart-contexts').SmartContexts} smart_contexts
 * @param {string} context_name
 * @returns {import('smart-contexts').SmartContext|null}
 */
export function get_named_context(smart_contexts, context_name = '') {
  const normalized_name = normalize_named_context_name(context_name);
  if (!normalized_name || !smart_contexts) return null;

  const by_key = smart_contexts.get?.(normalized_name);
  if (by_key) return by_key;

  const normalized_lookup = normalized_name.toLowerCase();
  const by_name = smart_contexts.filter?.((item) => {
    return normalize_named_context_name(item?.data?.name).toLowerCase() === normalized_lookup;
  })?.[0];

  return by_name || null;
}

/**
 * @param {string} named_context
 * @param {import('smart-contexts').SmartContexts} smart_contexts
 * @returns {Array<{ key: string, d: number, size?: number, mtime?: number, ctx_codeblock: boolean, from_named_context: string }>}
 */
export function get_named_context_items(named_context, smart_contexts) {
  const normalized_name = normalize_named_context_name(named_context);
  if (!normalized_name || !smart_contexts) return [];

  const context = get_named_context(smart_contexts, normalized_name);
  const context_items = context?.data?.context_items || {};

  return Object.entries(context_items)
    .filter(([, item_data]) => !item_data?.exclude)
    .map(([key, item_data]) => ({
      key,
      d: Number.isFinite(item_data?.d) ? item_data.d : 0,
      size: item_data?.size,
      mtime: item_data?.mtime,
      ctx_codeblock: true,
      from_named_context: normalized_name,
    }))
  ;
}

/**
 * @param {string} source_path
 * @returns {string}
 */
export function get_note_basename(source_path = '') {
  const normalized_path = String(source_path || '').trim().replace(/\\+/g, '/');
  if (!normalized_path) return 'Context';

  const file_name = normalized_path.split('/').pop() || '';
  const base_name = file_name.replace(/\.[^.]+$/u, '');
  return base_name || 'Context';
}

/**
 * @param {Date|number|string} value
 * @returns {string}
 */
export function format_ymd(value) {
  const date = value instanceof Date
    ? value
    : new Date(value || Date.now())
  ;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * @param {import('smart-contexts').SmartContexts} smart_contexts
 * @returns {Set<string>}
 */
function get_existing_context_names(smart_contexts) {
  const names = new Set();
  const items = smart_contexts?.items ? Object.values(smart_contexts.items) : [];

  items.forEach((item) => {
    const name = normalize_named_context_name(item?.data?.name);
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
  const normalized_base_name = normalize_named_context_name(base_name) || 'Context';
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
export function build_default_named_context_name(source_path, smart_contexts, params = {}) {
  const now = params.now instanceof Date ? params.now : new Date();
  const base_name = `${get_note_basename(source_path)} ${format_ymd(now)}`;
  return build_unique_context_name(base_name, get_existing_context_names(smart_contexts));
}
