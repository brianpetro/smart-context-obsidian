/**
 * Create a new Smart Context and open the configured Builder.
 *
 * The normal command starts from the active note. Explicit add_items and
 * start_empty always win.
 *
 * @this {import('smart-contexts').SmartContexts}
 * @param {object} [params={}]
 * @param {Array<string|object>} [params.add_items]
 * @param {boolean} [params.start_empty]
 * @param {object} [params.origin]
 * @returns {import('smart-contexts').SmartContext}
 */
export function smart_contexts_open_new(params = {}) {
  const has_explicit_add_items = Array.isArray(params.add_items);
  const add_items = unique_context_items(params.add_items);
  const seeded_keys = add_items.map(get_context_item_key);
  let active_source_key = '';

  if (!has_explicit_add_items && params.start_empty !== true) {
    active_source_key = get_active_source_key(this);
    if (active_source_key && !seeded_keys.includes(active_source_key)) {
      add_items.push(active_source_key);
      seeded_keys.push(active_source_key);
    }
  }

  const ctx = this.new_context({}, { add_items });
  const {
    add_items: _add_items,
    start_empty: _start_empty,
    origin,
    ...builder_params
  } = params;

  builder_params.origin = build_origin(
    origin,
    seeded_keys,
    active_source_key,
  );
  builder_params.event_source = builder_params.event_source
    || 'smart_contexts_open_new'
  ;

  this.open_builder(ctx, builder_params);
  return ctx;
}

/**
 * @param {import('smart-contexts').SmartContexts} smart_contexts
 * @returns {string}
 */
function get_active_source_key(smart_contexts) {
  const env = smart_contexts?.env;
  const active_path = env?.obsidian_app?.workspace?.getActiveFile?.()?.path;
  if (!active_path) return '';

  const source = env.smart_sources?.get?.(active_path)
    || env.smart_sources?.items?.[active_path]
    || null
  ;
  return String(source?.key || '').trim();
}

/**
 * @param {object|undefined} origin
 * @param {string[]} seeded_keys
 * @param {string} active_source_key
 * @returns {object}
 */
function build_origin(origin, seeded_keys, active_source_key) {
  const normalized_seeded_keys = unique_strings(
    Array.isArray(origin?.seeded_keys)
      ? origin.seeded_keys
      : seeded_keys,
  );

  if (origin && typeof origin === 'object') {
    return {
      ...origin,
      selection_count: Number.isFinite(origin.selection_count)
        ? Math.max(0, origin.selection_count)
        : normalized_seeded_keys.length,
      seeded_keys: normalized_seeded_keys,
    };
  }

  if (active_source_key) {
    return {
      kind: 'active_note',
      source_path: active_source_key,
      selection_count: 1,
      seeded_keys: normalized_seeded_keys,
    };
  }

  if (normalized_seeded_keys.length) {
    return {
      kind: 'preselected',
      selection_count: normalized_seeded_keys.length,
      seeded_keys: normalized_seeded_keys,
    };
  }

  return {
    kind: 'empty',
    selection_count: 0,
    seeded_keys: [],
  };
}

/**
 * Preserve structured item payloads while deduplicating by their context key.
 *
 * @param {unknown} values
 * @returns {Array<string|object>}
 */
function unique_context_items(values) {
  if (!Array.isArray(values)) return [];

  const seen_keys = new Set();
  return values.reduce((items, value) => {
    const item_key = get_context_item_key(value);
    if (!item_key || seen_keys.has(item_key)) return items;
    seen_keys.add(item_key);
    items.push(typeof value === 'string' ? item_key : value);
    return items;
  }, []);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function get_context_item_key(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const item = /** @type {{key?:unknown,path?:unknown}} */ (value);
  return String(item.key || item.path || '').trim();
}

/**
 * @param {unknown} values
 * @returns {string[]}
 */
function unique_strings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map(get_context_item_key)
    .filter(Boolean))]
  ;
}

export const commands = {
  'new-context-open-selector': {
    name: 'Open Context Builder',

    register_when({ plugin }) {
      return plugin.manifest.id === 'smart-context';
    },

    get_scope({ env }) {
      return env.smart_contexts;
    },
  },
};

export const ribbon_icons = {
  new_context: {
    icon_name: 'smart-context-builder',
    description: 'Smart Context: Open Builder',

    register_when({ plugin }) {
      return plugin.manifest.id === 'smart-context';
    },

    get_scope({ env }) {
      return env.smart_contexts;
    },
  },
};
