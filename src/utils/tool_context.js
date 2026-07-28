const CONTEXT_ITEM_FIELDS = [
  'name',
  'title',
  'at',
  'd',
  'folder',
  'named_context',
];

export const context_name_action_scope = {
  type: 'item',
  collection_key: 'smart_contexts',
  item_arg: 'name',

  resolve({ env, params }) {
    const name = to_trimmed_string(params.name);
    const smart_contexts = env.smart_contexts;
    if (!name || !smart_contexts) return null;

    const named_context = smart_contexts.get_named_context?.(name)
      || smart_contexts.get?.(name)
    ;
    if (named_context) return named_context;

    const normalized_name = name.toLowerCase();
    return Object.values(smart_contexts.items || {}).find((context) => {
      return [
        context?.key,
        context?.data?.key,
        context?.name,
        context?.data?.name,
        context?.data?.title,
      ].some((candidate) => {
        return to_trimmed_string(candidate).toLowerCase() === normalized_name;
      });
    }) || null;
  },
};

export const context_item_schema = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    name: { type: 'string' },
    title: { type: 'string' },
    at: { type: 'number' },
    d: { type: 'number' },
    folder: { type: 'boolean' },
    named_context: { type: 'boolean' },
    nested_total: { type: 'integer' },
  },
  required: ['key'],
  additionalProperties: false,
};

export const context_result_schema = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    name: { type: 'string' },
    key: { type: 'string' },
    total: { type: 'integer' },
    items: {
      type: 'array',
      items: context_item_schema,
    },
  },
  required: ['ok', 'name', 'key', 'total', 'items'],
  additionalProperties: false,
};

export function to_trimmed_string(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function get_context_key(context) {
  return to_trimmed_string(context?.key)
    || to_trimmed_string(context?.data?.key)
  ;
}

export function get_context_name(context) {
  return to_trimmed_string(context?.data?.name)
    || to_trimmed_string(context?.data?.title)
    || to_trimmed_string(context?.name)
    || get_context_key(context)
  ;
}

export function get_collection_contexts(collection) {
  return Object.values(collection?.items || {})
    .filter((context) => Boolean(get_context_name(context)))
    .sort((left, right) => {
      return get_context_name(left).localeCompare(get_context_name(right));
    })
  ;
}

export function build_context_list_result(collection) {
  const names = get_collection_contexts(collection)
    .map(get_context_name)
    .filter(Boolean)
  ;

  return {
    total: names.length,
    names,
  };
}

export function build_context_result(context) {
  const context_items = context?.data?.context_items || {};
  const items = Object.entries(context_items)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item_data = {}]) => {
      const item = { key };
      CONTEXT_ITEM_FIELDS.forEach((field) => {
        const value = item_data[field];
        if (
          value === null
          || ['string', 'number', 'boolean'].includes(typeof value)
        ) {
          item[field] = value;
        }
      });
      if (item_data.context_items && typeof item_data.context_items === 'object') {
        item.nested_total = Object.keys(item_data.context_items).length;
      }
      return item;
    })
  ;

  return {
    ok: true,
    name: get_context_name(context),
    key: get_context_key(context),
    total: items.length,
    items,
  };
}

export function build_context_key(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  ;
}

export async function create_named_context(collection, name) {
  const existing = context_name_action_scope.resolve({
    env: collection.env,
    params: { name },
  });
  if (existing) return { context: existing, created: false };

  const key = build_context_key(name) || name;
  let context = null;

  if (typeof collection.new_context === 'function') {
    context = await collection.new_context({
      key,
      name,
      context_items: {},
    });
  } else if (typeof collection.create_or_update === 'function') {
    context = await collection.create_or_update({
      key,
      name,
      context_items: {},
    });
  }

  if (!context) {
    throw new Error('Unable to create Smart Context.');
  }

  await save_context(context);
  return { context, created: true };
}

export async function add_context_item(context, item_key) {
  const before = new Set(Object.keys(context?.data?.context_items || {}));

  if (typeof context.add_items === 'function') {
    await context.add_items([{ key: item_key }]);
  } else if (typeof context.add_item === 'function') {
    await context.add_item({ key: item_key });
  } else {
    throw new Error('Smart Context does not support adding items.');
  }

  await save_context(context);
  return Object.keys(context?.data?.context_items || {})
    .filter((key) => !before.has(key))
  ;
}

export async function remove_context_item(context, item_key) {
  const before = Object.keys(context?.data?.context_items || {});

  if (typeof context.remove_by_path === 'function') {
    await context.remove_by_path(item_key);
  } else if (typeof context.remove_items === 'function') {
    await context.remove_items([item_key]);
  } else if (typeof context.remove_item === 'function') {
    await context.remove_item(item_key);
  } else {
    throw new Error('Smart Context does not support removing items.');
  }

  await save_context(context);
  const after = new Set(Object.keys(context?.data?.context_items || {}));
  return before.filter((key) => !after.has(key));
}

export async function save_context(context) {
  await context?.queue_save?.();
  await context?.collection?.process_save_queue?.();
}

export function normalize_context_item_key(env, value) {
  let item_key = to_trimmed_string(value).replace(/\\+/g, '/');
  if (!item_key) return '';
  if (item_key.startsWith('external:') || item_key.startsWith('selection:')) {
    return item_key;
  }

  if (item_key.toLowerCase().startsWith('file://')) {
    try {
      const url = new URL(item_key);
      item_key = decodeURIComponent(url.pathname || '');
      if (/^\/[a-zA-Z]:\//.test(item_key)) item_key = item_key.slice(1);
    } catch {
      item_key = item_key.replace(/^file:\/+/i, '/');
    }
  }

  const vault_path = get_vault_base_path(env);
  if (is_absolute_path(item_key) && vault_path) {
    item_key = get_relative_path(vault_path, item_key);
  }

  item_key = item_key.replace(/^\.\//, '');
  if (item_key === '..' || item_key.startsWith('../')) {
    return `external:${item_key}`;
  }
  if (is_absolute_path(item_key)) {
    return `external:${item_key}`;
  }
  return item_key;
}

function get_vault_base_path(env) {
  const adapter = env?.plugin?.app?.vault?.adapter
    || env?.app?.vault?.adapter
    || env?.vault?.adapter
  ;
  const base_path = adapter?.getBasePath?.() || adapter?.basePath || '';
  return to_trimmed_string(base_path).replace(/\\+/g, '/').replace(/\/+$/, '');
}

function is_absolute_path(value) {
  return value.startsWith('/') || /^[a-zA-Z]:\//.test(value);
}

function get_relative_path(from, to) {
  const from_parts = from.replace(/\\+/g, '/').split('/').filter(Boolean);
  const to_parts = to.replace(/\\+/g, '/').split('/').filter(Boolean);
  const case_insensitive = /^[a-zA-Z]:$/.test(from_parts[0] || '');
  let shared = 0;

  while (shared < from_parts.length && shared < to_parts.length) {
    const left = case_insensitive ? from_parts[shared].toLowerCase() : from_parts[shared];
    const right = case_insensitive ? to_parts[shared].toLowerCase() : to_parts[shared];
    if (left !== right) break;
    shared += 1;
  }

  return [
    ...Array(from_parts.length - shared).fill('..'),
    ...to_parts.slice(shared),
  ].join('/');
}
