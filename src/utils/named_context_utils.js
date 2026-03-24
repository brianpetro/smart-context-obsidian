import { resolve_name_status, get_context_name_input_value, persist_context_name } from './actions_utils.js';
import { context_named_context_prefixes } from './context_codeblock_constants.js';
import { normalize_string } from './pure_utils.js';
import { setIcon } from 'obsidian';

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

    const context_name = normalize_string(
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
  const normalized_name = normalize_string(context_name);
  if (!normalized_name || !smart_contexts) return null;

  const by_key = smart_contexts.get?.(normalized_name);
  if (by_key) return by_key;

  const normalized_lookup = normalized_name.toLowerCase();
  const by_name = smart_contexts.filter?.((item) => {
    return normalize_string(item?.data?.name).toLowerCase() === normalized_lookup;
  })?.[0];

  return by_name || null;
}

/**
 * @param {string} named_context
 * @param {import('smart-contexts').SmartContexts} smart_contexts
 * @returns {Array<{ key: string, d: number, size?: number, mtime?: number, ctx_codeblock: boolean, from_named_context: string }>}
 */
export function get_named_context_items(named_context, smart_contexts) {
  const normalized_name = normalize_string(named_context);
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
export function build_default_named_context_name(source_path, smart_contexts, params = {}) {
  const now = params.now instanceof Date ? params.now : new Date();
  const base_name = `${get_note_basename(source_path)} ${format_ymd(now)}`;
  return build_unique_context_name(base_name, get_existing_context_names(smart_contexts));
}

export function render_name_input(ctx, container) {
  const name_wrapper = document.createElement('div');
  name_wrapper.className = 'sc-context-name-wrapper';
  name_wrapper.style.display = 'flex';
  name_wrapper.style.alignItems = 'center';
  name_wrapper.style.gap = 'var(--size-4-2)';
  container.appendChild(name_wrapper);

  const name_input = document.createElement('input');
  name_input.type = 'text';
  name_input.className = 'sc-context-name-input';
  name_input.placeholder = 'Context name…';
  name_input.setAttribute('aria-label', 'Context name');
  name_wrapper.appendChild(name_input);

  const status_span = document.createElement('span');
  status_span.className = 'sc-context-name-status';
  status_span.setAttribute('aria-label', 'Context saved status');
  status_span.setAttribute('aria-live', 'polite');
  status_span.hidden = true;
  name_wrapper.appendChild(status_span);

  const update_name_status = () => {
    const status = resolve_name_status(ctx, { input_value: name_input.value });
    status_span.hidden = !status.label;
    status_span.dataset.state = status.is_saved ? 'saved' : 'idle';
    if(status.is_saved) {
      status_span.setAttribute('aria-label', 'Context saved as ' + name_input.value);
      setIcon(status_span, 'checkmark');
    } else {
      status_span.setAttribute('aria-label', 'Context name has unsaved changes');
      status_span.style.removeProperty('--icon');
    }
  };

  const refresh_name = () => {
    name_input.value = get_context_name_input_value(ctx);
    update_name_status();
  };

  const save_name = () => {
    const next_name = sanitize_context_name(name_input.value);
    const current_name = get_context_name_input_value(ctx);

    if (next_name === current_name) {
      update_name_status();
      return;
    }

    const result = persist_context_name(ctx, {
      input_value: next_name,
      open_selector: false,
    });

    name_input.value = result?.context_name ?? next_name;
    refresh_name();
  };

  refresh_name();

  name_input.addEventListener('keydown', (e) => {
    // Intentionally allow default keydown behavior (e.g., text input, navigation)
    // Prevent event bubbling to avoid parent handlers interfering
    e.stopPropagation();
    if (e.key === 'Enter') {
      save_name();
      name_input.blur();
    }
    if (e.key === 'Escape') {
      refresh_name();
      name_input.blur();
    }
  });
  name_input.addEventListener('blur', () => save_name());
  name_input.addEventListener('input', () => update_name_status());

  function sanitize_context_name(name) {
    const str = String(name ?? '').trim();
    if (!str) return '';
    const collapsed = str.replace(/\s+/g, ' ');
    const max = 120;
    return collapsed.length > max ? collapsed.slice(0, max) : collapsed;
  }
}
