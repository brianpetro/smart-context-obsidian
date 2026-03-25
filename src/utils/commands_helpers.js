import { copy_to_clipboard } from 'obsidian-smart-env/src/utils/copy_to_clipboard.js';
import { context_to_md_tree } from 'obsidian-smart-env/src/utils/smart-context/to_md_tree.js';
import {
  get_or_create_codeblock_context_from_note,
} from './context_codeblock_utils.js';
import {
  build_copy_current_context,
  create_temp_context,
} from './temp_context_utils.js';

/**
 * Resolve the current active source path from a Markdown view or active file.
 *
 * @param {object} params
 * @param {{ file?: { path?: string } }=} params.view
 * @param {{ path?: string }=} params.active_file
 * @returns {string|undefined}
 */
export function resolve_active_source_path(params = {}) {
  const { view, active_file } = params;
  return view?.file?.path || active_file?.path;
}

/**
 * Normalize allowed file-type filters.
 *
 * @param {string[]|undefined} allowed_file_types
 * @returns {Set<string>}
 */
function normalize_allowed_file_types(allowed_file_types) {
  if (!Array.isArray(allowed_file_types)) return new Set();

  return new Set(
    allowed_file_types
      .map((file_type) => String(file_type || '').trim())
      .filter(Boolean)
  );
}

/**
 * Determine whether a source can be used by the current-note copy flow.
 *
 * @param {object} source
 * @param {object} [params={}]
 * @param {string[]} [params.allowed_file_types]
 * @returns {boolean}
 */
export function is_copy_current_supported_source(source, params = {}) {
  if (!source) return false;

  const allowed_file_types = normalize_allowed_file_types(params.allowed_file_types);
  if (!allowed_file_types.size) return true;

  const source_file_type = String(source?.file_type || '').trim();
  if (!source_file_type) return false;

  return allowed_file_types.has(source_file_type);
}

/**
 * Resolve the shared dependencies needed by copy-current commands.
 *
 * @param {object} env
 * @param {object} [params={}]
 * @param {string=} params.source_path
 * @param {string[]} [params.allowed_file_types]
 * @returns {{ source_path: string, source: object, modal_class: Function }|null}
 */
export function get_copy_current_dependencies(env, params = {}) {
  if (!env?.smart_sources) return null;

  const source_path = typeof params.source_path === 'string'
    ? params.source_path
    : ''
  ;
  if (!source_path) return null;

  const source = env.smart_sources.get(source_path);
  if (!source) return null;
  if (!is_copy_current_supported_source(source, {
    allowed_file_types: params.allowed_file_types,
  })) {
    return null;
  }

  const modal_class = env.config?.modals?.copy_context_modal?.class;
  if (!modal_class) return null;

  return {
    source_path,
    source,
    modal_class,
  };
}

/**
 * Resolve the Pro "Copy with media" preference for current-note copy commands.
 *
 * Explicit params win over settings. Core always returns false.
 *
 * @param {any} env
 * @param {object} [params={}]
 * @param {boolean} [params.with_media]
 * @returns {boolean}
 */
export function resolve_copy_current_with_media(env, params = {}) {
  if (typeof params.with_media === 'boolean') {
    return params.with_media;
  }

  if (!env?.is_pro) return false;
  return Boolean(
    env?.smart_contexts?.settings?.actions?.context_copy_to_clipboard?.copy_with_media,
  );
}

/**
 * Persist the Pro "Copy with media" preference.
 *
 * @param {any} env
 * @param {boolean} enabled
 * @returns {boolean}
 */
export function set_copy_current_with_media_setting(env, enabled) {
  if (!env?.smart_contexts?.settings) return false;

  const settings = env.smart_contexts.settings;
  settings.actions = settings.actions || {};
  settings.actions.context_copy_to_clipboard = settings.actions.context_copy_to_clipboard || {};
  settings.actions.context_copy_to_clipboard.copy_with_media = Boolean(enabled);
  env.smart_contexts.queue_save?.();
  return settings.actions.context_copy_to_clipboard.copy_with_media;
}

/**
 * Toggle the Pro "Copy with media" preference.
 *
 * @param {any} env
 * @returns {boolean}
 */
export function toggle_copy_current_with_media_setting(env) {
  const next_value = !resolve_copy_current_with_media(env);
  return set_copy_current_with_media_setting(env, next_value);
}

/**
 * Build the default fixed-depth filter for direct current-note copy commands.
 *
 * @param {object} [params={}]
 * @param {number} [params.max_depth]
 * @param {boolean} [params.include_inlinks=false]
 * @param {(ctx_item: any) => boolean} [params.filter]
 * @returns {(ctx_item: any) => boolean}
 */
export function build_copy_current_filter(params = {}) {
  const max_depth = Number.isFinite(params.max_depth)
    ? params.max_depth
    : Number.POSITIVE_INFINITY
  ;
  const has_inlink_preference = typeof params.include_inlinks === 'boolean';
  const include_inlinks = params.include_inlinks === true;
  const additional_filter = typeof params.filter === 'function'
    ? params.filter
    : null
  ;

  return (ctx_item) => {
    const depth = Number.isFinite(ctx_item?.data?.d) ? ctx_item.data.d : 0;
    if (depth > max_depth) return false;
    if (has_inlink_preference && !include_inlinks && ctx_item?.data?.inlink) return false;
    if (additional_filter && !additional_filter(ctx_item)) return false;
    return true;
  };
}

/**
 * Emit a standardized build failure event.
 *
 * @param {object} plugin
 * @param {object} [params={}]
 * @param {string} [params.message]
 * @param {string} [params.details]
 * @param {string} [params.event_source='copy_current_command_utils']
 * @returns {void}
 */
function emit_copy_current_build_failed(plugin, params = {}) {
  plugin?.env?.events?.emit?.('context:build_failed', {
    level: 'error',
    message: params.message || 'Failed to build context for current note.',
    details: params.details || '',
    event_source: params.event_source || 'copy_current_command_utils',
  });
}

/**
 * Build the current-note copy context, merging hydrated codeblock items at
 * depth 0 when present.
 *
 * @param {object} plugin
 * @param {object} [params={}]
 * @param {string} params.source_path
 * @param {object} params.source
 * @param {string} [params.markdown]
 * @param {string} [params.key]
 * @returns {Promise<import('smart-contexts').SmartContext|null>}
 */
export async function build_current_copy_context(plugin, params = {}) {
  const {
    source_path,
    source,
    markdown,
  } = params;

  if (!plugin?.env || !source_path || !source) {
    emit_copy_current_build_failed(plugin, {
      event_source: 'copy_current_command_utils.build_current_copy_context',
    });
    return null;
  }

  try {
    const ctx = await source.actions.source_get_context();
    if (!ctx) {
      emit_copy_current_build_failed(plugin, {
        event_source: 'copy_current_command_utils.build_current_copy_context',
      });
      return null;
    }

    const codeblock_ctx = await get_or_create_codeblock_context_from_note(plugin, source_path, {
      markdown,
    });

    return build_copy_current_context(ctx, {
      codeblock_ctx,
      key: params.key || `${source_path}#copy_current`,
    }) || ctx;
  } catch (error) {
    console.error('build_current_copy_context failed', error);
    emit_copy_current_build_failed(plugin, {
      details: error?.message || '',
      event_source: 'copy_current_command_utils.build_current_copy_context',
    });
    return null;
  }
}

/**
 * Build a filtered temporary context for exports that should not use the full
 * in-memory context item set.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {(ctx_item: any) => boolean} filter
 * @param {string} [key_suffix='filtered']
 * @returns {import('smart-contexts').SmartContext|null}
 */
function build_filtered_temp_context(ctx, filter, key_suffix = 'filtered') {
  const filtered_items = ctx?.context_items?.filter?.(filter) || [];
  if (!filtered_items.length) return null;

  const context_items = filtered_items.reduce((acc, item) => {
    acc[item.key] = {
      ...(item?.data && typeof item.data === 'object' ? item.data : {}),
      key: item.key,
    };
    return acc;
  }, {});

  return create_temp_context(ctx, {
    key: `${ctx.key}#${key_suffix}`,
    context_items,
  });
}

/**
 * Build the current-note context, merge in any hydrated codeblock items, and
 * open the configured CopyContextModal.
 *
 * Shared by Core and Pro so codeblock copy flows stay aligned. Parser details
 * are injected by the caller.
 *
 * @param {object} plugin
 * @param {object} [params={}]
 * @param {string} params.source_path
 * @param {object} params.source
 * @param {Function} params.modal_class
 * @param {string} [params.markdown]
 * @param {boolean} [params.with_media]
 * @returns {Promise<boolean>}
 */
export async function open_copy_current_modal(plugin, params = {}) {
  const {
    modal_class,
  } = params;

  if (typeof modal_class !== 'function') {
    emit_copy_current_build_failed(plugin, {
      event_source: 'copy_current_command_utils.open_copy_current_modal',
    });
    return false;
  }

  const copy_ctx = await build_current_copy_context(plugin, params);
  if (!copy_ctx) return false;

  const with_media = resolve_copy_current_with_media(copy_ctx.env, params);
  const modal_params = with_media ? { with_media: true } : {};
  const modal = new modal_class(copy_ctx, modal_params);
  modal.open();
  return true;
}

/**
 * Copy the current-note context directly to the clipboard using a fixed-depth
 * filter.
 *
 * @param {object} plugin
 * @param {object} [params={}]
 * @param {string} params.source_path
 * @param {object} params.source
 * @param {number} [params.max_depth]
 * @param {boolean} [params.include_inlinks=false]
 * @param {boolean} [params.with_media]
 * @returns {Promise<boolean>}
 */
export async function copy_current_to_clipboard(plugin, params = {}) {
  const copy_ctx = await build_current_copy_context(plugin, params);
  if (!copy_ctx) return false;

  const with_media = resolve_copy_current_with_media(copy_ctx.env, params);
  const filter = build_copy_current_filter(params);

  return await copy_ctx.actions.context_copy_to_clipboard({
    ...params,
    with_media,
    filter,
  });
}

/**
 * Copy the current-note context as a markdown link tree.
 *
 * @param {object} plugin
 * @param {object} [params={}]
 * @returns {Promise<boolean>}
 */
export async function copy_current_as_link_tree(plugin, params = {}) {
  const copy_ctx = await build_current_copy_context(plugin, params);
  if (!copy_ctx) return false;

  const filter = build_copy_current_filter(params);
  const filtered_ctx = build_filtered_temp_context(copy_ctx, filter, 'link_tree') || copy_ctx;
  const md_tree = context_to_md_tree(filtered_ctx).trim();
  if (!md_tree) {
    copy_ctx.emit_event('context:copy_empty', {
      level: 'warning',
      message: 'No context items to copy.',
      event_source: 'copy_current_command_utils.copy_current_as_link_tree',
    });
    return false;
  }

  const copied = await copy_to_clipboard(md_tree, {
    env: copy_ctx.env,
    event_source: 'copy_current_command_utils.copy_current_as_link_tree',
    success_event_key: 'context:clipboard_raw_copied',
    error_event_key: 'context:clipboard_raw_copy_failed',
    unavailable_event_key: 'context:clipboard_copy_unavailable',
  });
  if (!copied) return false;

  copy_ctx.emit_event('context:current_tree_copied', {
    level: 'info',
    message: 'Copied current context link tree to clipboard.',
    event_source: 'copy_current_command_utils.copy_current_as_link_tree',
  });
  return true;
}
