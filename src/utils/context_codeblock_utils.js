import { MarkdownView } from 'obsidian';
import { build_codeblock_entries } from './build_codeblock_entries.js';
import { build_default_named_context_name } from './named_context_utils.js';
import {
  context_codeblock_types,
  context_named_context_prefixes,
  default_context_codeblock_type,
  default_named_context_line_prefix,
} from './context_codeblock_constants.js';

export { build_default_named_context_name } from './named_context_utils.js';
export {
  context_codeblock_types,
  default_context_codeblock_type,
} from './context_codeblock_constants.js';

/**
 * @param {string} value
 * @returns {string}
 */
function normalize_string(value = '') {
  return String(value ?? '').trim();
}

/**
 * @param {string} value
 * @returns {string}
 */
function escape_regex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} source_path
 * @returns {string}
 */
export function get_context_codeblock_ctx_key(source_path = '') {
  return `${String(source_path || '').trim()}#codeblock`;
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function is_codeblock_context_key(key = '') {
  return typeof key === 'string' && key.endsWith('#codeblock');
}

/**
 * @param {string} codeblock_type
 * @returns {string}
 */
export function get_named_context_line_prefix_for_codeblock_type(codeblock_type = '') {
  const normalized_type = normalize_string(codeblock_type);
  if (context_codeblock_types.includes(normalized_type)) {
    return normalized_type;
  }
  return default_named_context_line_prefix;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {string[]}
 */
function build_codeblock_entries_for_ctx(ctx) {
  return build_codeblock_entries({
    context_items: ctx?.data?.context_items || {},
    codeblock_named_contexts: ctx?.data?.codeblock_named_contexts || [],
    passthrough_lines: ctx?.data?.codeblock_passthrough_lines || [],
    named_context_line_prefix: get_named_context_line_prefix_for_codeblock_type(
      ctx?.data?.codeblock_type,
    ),
  });
}

/**
 * @param {import('smart-contexts').SmartContext} smart_context
 * @param {object} [params={}]
 * @param {string} [params.codeblock_type]
 * @param {string} [params.cb_hash]
 * @param {object[]} [params.context_items]
 * @param {string[]} [params.named_contexts]
 * @param {string[]} [params.passthrough_lines]
 * @returns {void}
 */
export function apply_parsed_codeblock_context(smart_context, params = {}) {
  const context_items = Array.isArray(params.context_items) ? params.context_items : [];
  const codeblock_type = normalize_string(params.codeblock_type);
  smart_context.data.context_items = {};
  smart_context.data.codeblock_type = codeblock_type || smart_context.data.codeblock_type || default_context_codeblock_type;
  smart_context.data.codeblock_named_contexts = Array.isArray(params.named_contexts)
    ? [...params.named_contexts]
    : []
  ;
  smart_context.data.codeblock_passthrough_lines = Array.isArray(params.passthrough_lines)
    ? [...params.passthrough_lines]
    : []
  ;

  if (typeof params.cb_hash === 'string' && params.cb_hash) {
    smart_context._cb_hash = params.cb_hash;
  }

  context_items.forEach((item_data) => {
    const item_key = item_data?.key || item_data?.path;
    if (!item_key) return;
    smart_context.data.context_items[item_key] = {
      d: 0,
      at: Date.now(),
      ...item_data,
      key: item_key,
    };
  });
}

/**
 * @param {string} markdown
 * @returns {{ codeblock_type: string, cb_content: string } | null}
 */
export function get_context_codeblock_snapshot(markdown = '') {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const range = find_context_codeblock_range(lines);
  if (!range) return null;

  return {
    codeblock_type: range.codeblock_type || default_context_codeblock_type,
    cb_content: lines.slice(range.start + 1, range.end).join('\n'),
  };
}

/**
 * @param {import('obsidian').App} app
 * @param {string} source_path
 * @returns {Promise<string>}
 */
async function read_note_markdown(app, source_path) {
  const active_view = app?.workspace?.getActiveViewOfType?.(MarkdownView);
  if (active_view?.file?.path === source_path && active_view.editor) {
    return active_view.editor.getValue();
  }

  const file = app?.vault?.getFileByPath?.(source_path) || app?.vault?.getAbstractFileByPath?.(source_path);
  if (!file) return '';
  return await app.vault.read(file);
}

/**
 * Hydrate a codeblock context on demand from note contents.
 *
 * @param {import('obsidian').Plugin} plugin
 * @param {string} source_path
 * @param {object} [params={}]
 * @param {string} [params.markdown]
 * @param {(cb_content: string, snapshot?: { codeblock_type: string, cb_content: string }) => Promise<object>|object} [params.parse_codeblock]
 * @returns {Promise<import('smart-contexts').SmartContext|null>}
 */
export async function get_or_create_codeblock_context_from_note(plugin, source_path, params = {}) {
  const smart_contexts = plugin?.env?.smart_contexts;
  if (!smart_contexts?.new_context || !source_path) return null;

  const parse_codeblock = params.parse_codeblock;
  if (typeof parse_codeblock !== 'function') return null;

  const markdown = typeof params.markdown === 'string'
    ? params.markdown
    : await read_note_markdown(plugin?.app, source_path)
  ;
  if (!markdown) return null;

  const snapshot = get_context_codeblock_snapshot(markdown);
  if (!snapshot) return null;

  const parsed = await parse_codeblock(snapshot.cb_content, snapshot);
  const ctx_key = get_context_codeblock_ctx_key(source_path);
  const smart_context = smart_contexts.get(ctx_key) || smart_contexts.new_context({ key: ctx_key });

  if (
    smart_context._cb_hash !== parsed?.cb_hash
    || smart_context?.data?.codeblock_type !== snapshot.codeblock_type
  ) {
    apply_parsed_codeblock_context(smart_context, {
      codeblock_type: snapshot.codeblock_type,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
    });
  }

  return smart_context;
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function is_context_codeblock_fence(line = '') {
  const normalized_line = String(line || '').trim();
  const pattern = context_codeblock_types
    .map((type) => escape_regex(type))
    .join('|')
  ;
  return new RegExp(`^\`\`\`(?:${pattern})\\s*$`).test(normalized_line);
}

/**
 * @param {string[]} lines
 * @returns {{ start: number, end: number, codeblock_type: string } | null}
 */
export function find_context_codeblock_range(lines = []) {
  let start = -1;
  let codeblock_type = default_context_codeblock_type;

  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '').trim();

    if (start === -1) {
      if (!is_context_codeblock_fence(line)) continue;
      start = i;
      const match = line.match(/^\`\`\`([^\s]+)\s*$/);
      codeblock_type = match?.[1] || default_context_codeblock_type;
      continue;
    }

    if (/^\`\`\`\s*$/.test(line)) {
      return {
        start,
        end: i,
        codeblock_type,
      };
    }
  }

  return null;
}

/**
 * @param {string} markdown
 * @returns {boolean}
 */
export function has_context_codeblock(markdown = '') {
  const lines = String(markdown || '').split('\n');
  return Boolean(find_context_codeblock_range(lines));
}

/**
 * @param {string} contents
 * @returns {string}
 */
function normalize_codeblock_contents(contents = '') {
  const normalized_contents = String(contents ?? '').replace(/\r\n/g, '\n');
  return normalized_contents.endsWith('\n')
    ? normalized_contents
    : `${normalized_contents}\n`
  ;
}

/**
 * @param {string} raw
 * @param {string} next_contents
 * @returns {string}
 */
export function replace_context_codeblock_contents(raw, next_contents) {
  const current_raw = String(raw ?? '');
  const lines = current_raw.split('\n');
  const range = find_context_codeblock_range(lines);
  if (!range) return current_raw;

  const replacement_lines = normalize_codeblock_contents(next_contents).split('\n');
  if (replacement_lines[replacement_lines.length - 1] === '') {
    replacement_lines.pop();
  }

  lines.splice(range.start + 1, range.end - range.start - 1, ...replacement_lines);
  return lines.join('\n');
}

/**
 * @param {CodeMirror.Editor} editor
 * @param {object} [params={}]
 * @param {string} [params.codeblock_type]
 * @returns {boolean}
 */
export function ensure_context_codeblock_in_editor(editor, params = {}) {
  if (!editor || typeof editor.getValue !== 'function' || typeof editor.replaceRange !== 'function') {
    return false;
  }

  const markdown = editor.getValue();
  if (has_context_codeblock(markdown)) return false;

  const codeblock_type = String(params.codeblock_type || default_context_codeblock_type).trim() || default_context_codeblock_type;
  editor.replaceRange(
    `\n\`\`\`${codeblock_type}\n\n\`\`\`\n`,
    editor.getCursor(),
  );
  return true;
}

/**
 * @param {import('obsidian').App} app
 * @param {string} source_path
 * @param {string} next_contents
 * @returns {Promise<boolean>}
 */
export async function replace_context_codeblock_contents_in_note(app, source_path, next_contents) {
  if (!app || !source_path) return false;

  const active_view = app.workspace.getActiveViewOfType(MarkdownView);
  if (active_view?.file?.path === source_path && active_view.editor) {
    const editor = active_view.editor;
    const lines = editor.getValue().split('\n');
    const range = find_context_codeblock_range(lines);
    if (range) {
      editor.replaceRange(
        normalize_codeblock_contents(next_contents),
        { line: range.start + 1, ch: 0 },
        { line: range.end, ch: 0 },
      );
      return true;
    }
  }

  const file = app.vault.getFileByPath?.(source_path) || app.vault.getAbstractFileByPath?.(source_path);
  if (!file) return false;

  const raw = await app.vault.read(file);
  const next_raw = replace_context_codeblock_contents(raw, next_contents);
  if (next_raw === raw) return false;
  await app.vault.modify(file, next_raw);
  return true;
}

/**
 * @param {Record<string, unknown>} item_data
 * @returns {Record<string, unknown>}
 */
function sanitize_codeblock_item_payload(item_data = {}) {
  const next_payload = {};
  const allowed_keys = ['key', 'd', 'at', 'mtime', 'size', 'link', 'inlink'];

  allowed_keys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(item_data, key)) return;
    next_payload[key] = item_data[key];
  });

  return next_payload;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {Array<Record<string, unknown>>}
 */
export function get_active_codeblock_item_payloads(ctx) {
  return Object.entries(ctx?.data?.context_items || {})
    .filter(([, item_data]) => !item_data?.exclude)
    .map(([item_key, item_data]) => {
      const payload = sanitize_codeblock_item_payload({
        ...item_data,
        key: item_data?.key || item_key,
      });
      payload.key = payload.key || item_key;
      payload.d = Number.isFinite(payload.d) ? payload.d : 0;
      return payload;
    })
  ;
}

/**
 * @param {Record<string, object>} context_items
 * @returns {Record<string, object>}
 */
function clone_context_items_map(context_items = {}) {
  return Object.entries(context_items || {}).reduce((acc, [item_key, item_data]) => {
    if (!item_key) return acc;
    acc[item_key] = {
      ...(item_data && typeof item_data === 'object' ? item_data : {}),
      key: item_data?.key || item_key,
    };
    return acc;
  }, {});
}

/**
 * @param {string} item_key
 * @param {Record<string, unknown>} item_data
 * @returns {Record<string, unknown>}
 */
function normalize_codeblock_copy_item(item_key, item_data = {}) {
  const existing_item = item_data && typeof item_data === 'object'
    ? item_data
    : {}
  ;
  return {
    ...existing_item,
    key: existing_item.key || item_key,
    d: 0,
  };
}

/**
 * Merge source-get-context items with codeblock items for copy-current flows.
 * Codeblock items are always treated as depth zero.
 *
 * @param {Record<string, object>} source_context_items
 * @param {Record<string, object>} codeblock_context_items
 * @returns {Record<string, object>}
 */
function merge_copy_context_items(source_context_items = {}, codeblock_context_items = {}) {
  const merged_context_items = clone_context_items_map(source_context_items);

  Object.entries(codeblock_context_items || {}).forEach(([item_key, item_data]) => {
    if (!item_key) return;

    const existing_item = merged_context_items[item_key] || {};
    const normalized_item = normalize_codeblock_copy_item(item_key, item_data);

    merged_context_items[item_key] = {
      ...existing_item,
      ...normalized_item,
      key: normalized_item.key || item_key,
      d: 0,
    };
  });

  return merged_context_items;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {string} [params.key]
 * @param {Record<string, object>} [params.context_items]
 * @returns {import('smart-contexts').SmartContext|null}
 */
function create_temp_context(ctx, params = {}) {
  if (!ctx?.env) return null;

  const TempClass = ctx.constructor;
  const temp_data = {
    ...(ctx.data || {}),
    key: normalize_string(params.key) || `${ctx.key}#temp`,
    context_items: clone_context_items_map(
      params.context_items || ctx?.data?.context_items || {},
    ),
  };

  const temp_ctx = new TempClass(ctx.env, temp_data);
  temp_ctx.collection = ctx.collection;
  return temp_ctx;
}

/**
 * Build a temporary copy-current context that includes codeblock items at depth zero.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {import('smart-contexts').SmartContext} [params.codeblock_ctx]
 * @param {string} [params.key]
 * @returns {import('smart-contexts').SmartContext|null}
 */
export function build_copy_current_context(ctx, params = {}) {
  if (!ctx) return null;

  const codeblock_ctx = params.codeblock_ctx;
  const codeblock_context_items = codeblock_ctx?.data?.context_items || {};
  if (!Object.keys(codeblock_context_items).length) return ctx;

  const merged_context_items = merge_copy_context_items(
    ctx?.data?.context_items || {},
    codeblock_context_items,
  );

  return create_temp_context(ctx, {
    key: normalize_string(params.key) || `${ctx.key}#copy_current`,
    context_items: merged_context_items,
  }) || ctx;
}

/**
 * @param {any} env
 * @param {string} action_key
 * @returns {string}
 */
function get_action_display_name(env, action_key) {
  return normalize_string(env?.config?.actions?.[action_key]?.display_name) || action_key;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {string[]}
 */
export function get_context_codeblock_suggest_action_keys(ctx) {
  const env = ctx?.env;
  const config_actions = env?.config?.actions || {};
  const default_action_keys = Array.isArray(env?.config?.modals?.context_selector?.default_suggest_action_keys)
    ? env.config.modals.context_selector.default_suggest_action_keys
    : []
  ;

  const all_action_keys = Object.keys(config_actions)
    .filter((action_key) => {
      if (!action_key.startsWith('context_suggest_')) return false;
      return typeof ctx?.actions?.[action_key] === 'function';
    })
  ;

  const prioritized_action_keys = default_action_keys
    .filter((action_key) => all_action_keys.includes(action_key))
  ;

  if (
    all_action_keys.includes('context_suggest_contexts')
    && !prioritized_action_keys.includes('context_suggest_contexts')
  ) {
    prioritized_action_keys.push('context_suggest_contexts');
  }

  const remaining_action_keys = all_action_keys
    .filter((action_key) => !prioritized_action_keys.includes(action_key))
    .sort((left, right) => {
      return get_action_display_name(env, left).localeCompare(get_action_display_name(env, right));
    })
  ;

  return [...new Set([...prioritized_action_keys, ...remaining_action_keys])];
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @returns {void}
 */
export function open_context_selector_for_codeblock(ctx, params = {}) {
  const default_suggest_action_keys = Array.isArray(params.default_suggest_action_keys)
    ? params.default_suggest_action_keys
    : get_context_codeblock_suggest_action_keys(ctx)
  ;

  ctx?.emit_event?.('context_selector:open', {
    ...params,
    default_suggest_action_keys,
  });
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {boolean} [params.include_exclusions=false]
 * @returns {number}
 */
export function get_codeblock_entry_count(ctx, params = {}) {
  const include_exclusions = params.include_exclusions === true;
  const entries = build_codeblock_entries_for_ctx(ctx);

  return entries.filter((entry) => {
    const normalized_entry = normalize_string(entry);
    if (!normalized_entry) return false;
    if (!include_exclusions && normalized_entry.startsWith('!')) return false;
    return true;
  }).length;
}

/**
 * @param {string} line
 * @param {object} [params={}]
 * @param {string} [params.old_name]
 * @param {string} [params.name]
 * @returns {string}
 */
function replace_named_context_reference_line(line = '', params = {}) {
  const old_name = normalize_string(params.old_name);
  const next_name = normalize_string(params.name);
  if (!old_name || !next_name || old_name === next_name) return line;

  const indent = line.match(/^\s*/u)?.[0] || '';
  const trimmed_line = String(line || '').trim();

  for (let i = 0; i < context_named_context_prefixes.length; i += 1) {
    const prefix = context_named_context_prefixes[i];
    if (!trimmed_line.startsWith(prefix)) continue;

    const context_name = normalize_string(trimmed_line.slice(prefix.length));
    if (context_name !== old_name) continue;

    return `${indent}${prefix} ${next_name}`;
  }

  return line;
}

/**
 * @param {string} markdown
 * @param {object} [params={}]
 * @param {string} [params.old_name]
 * @param {string} [params.name]
 * @returns {string}
 */
export function replace_named_context_references_in_markdown(markdown = '', params = {}) {
  const raw_markdown = String(markdown ?? '').replace(/\r\n/g, '\n');
  const lines = raw_markdown.split('\n');
  let in_codeblock = false;
  let did_update = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '');
    const trimmed_line = line.trim();

    if (!in_codeblock) {
      if (is_context_codeblock_fence(trimmed_line)) {
        in_codeblock = true;
      }
      continue;
    }

    if (/^\`\`\`\s*$/.test(trimmed_line)) {
      in_codeblock = false;
      continue;
    }

    const next_line = replace_named_context_reference_line(line, params);
    if (next_line === line) continue;

    lines[i] = next_line;
    did_update = true;
  }

  return did_update ? lines.join('\n') : raw_markdown;
}

/**
 * @param {import('obsidian').App} app
 * @param {string} source_path
 * @param {object} [params={}]
 * @param {string} [params.old_name]
 * @param {string} [params.name]
 * @returns {Promise<boolean>}
 */
export async function replace_named_context_references_in_note(app, source_path, params = {}) {
  if (!app || !source_path) return false;

  const active_view = app.workspace.getActiveViewOfType(MarkdownView);
  if (active_view?.file?.path === source_path && active_view.editor) {
    const editor = active_view.editor;
    const raw = editor.getValue();
    const next_raw = replace_named_context_references_in_markdown(raw, params);
    if (next_raw === raw) return false;
    if (typeof editor.setValue === 'function') {
      editor.setValue(next_raw);
      return true;
    }
  }

  const file = app.vault.getFileByPath?.(source_path) || app.vault.getAbstractFileByPath?.(source_path);
  if (!file) return false;

  const raw = await app.vault.read(file);
  const next_raw = replace_named_context_references_in_markdown(raw, params);
  if (next_raw === raw) return false;
  await app.vault.modify(file, next_raw);
  return true;
}

/**
 * @param {any} env
 * @param {object} [params={}]
 * @param {string} [params.old_name]
 * @param {string} [params.name]
 * @returns {Promise<number>}
 */
export async function sync_renamed_named_context_to_note_codeblocks(env, params = {}) {
  const app = env?.plugin?.app || env?.obsidian_app || null;
  const old_name = normalize_string(params.old_name);
  const next_name = normalize_string(params.name);
  if (!app?.vault?.getMarkdownFiles || !old_name || !next_name || old_name === next_name) {
    return 0;
  }

  const markdown_files = app.vault.getMarkdownFiles();
  let updated_count = 0;

  for (let i = 0; i < markdown_files.length; i += 1) {
    const file = markdown_files[i];
    const source_path = file?.path;
    if (!source_path) continue;

    try {
      const updated = await replace_named_context_references_in_note(app, source_path, {
        old_name,
        name: next_name,
      });
      if (updated) updated_count += 1;
    } catch (error) {
      console.error('context_codeblock: failed to sync renamed named context to note', {
        source_path,
        error,
      });
    }
  }

  return updated_count;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {boolean}
 */
export function can_convert_codeblock_to_named_context(ctx) {
  if ((ctx?.item_count || 0) <= 0) return false;
  return get_codeblock_entry_count(ctx) > 1;
}

/**
 * @param {string} context_name
 * @param {Array<Record<string, unknown>>} payloads
 * @returns {Array<Record<string, unknown>>}
 */
function build_codeblock_named_context_payloads(context_name, payloads = []) {
  return payloads.map((payload) => ({
    ...payload,
    from_named_context: context_name,
    ctx_codeblock: true,
  }));
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {string} [params.context_name]
 * @param {Array<Record<string, unknown>>} [params.payloads]
 * @returns {Array<Record<string, unknown>>}
 */
export function sync_codeblock_context_to_named_context(ctx, params = {}) {
  const context_name = normalize_string(params.context_name);
  const payloads = Array.isArray(params.payloads)
    ? params.payloads
    : get_active_codeblock_item_payloads(ctx)
  ;
  const next_payloads = build_codeblock_named_context_payloads(context_name, payloads);

  ctx.data.context_items = {};
  ctx.data.codeblock_named_contexts = context_name ? [context_name] : [];
  ctx.data.codeblock_passthrough_lines = [];
  ctx.add_items(next_payloads);

  return next_payloads;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {string} [params.old_name]
 * @param {string} [params.name]
 * @returns {boolean}
 */
export function sync_renamed_named_context_to_codeblock(ctx, params = {}) {
  const old_name = normalize_string(params.old_name);
  const next_name = normalize_string(params.name);
  if (!old_name || !next_name || old_name === next_name) return false;
  if (!is_codeblock_context_key(ctx?.key)) return false;

  const named_contexts = Array.isArray(ctx?.data?.codeblock_named_contexts)
    ? [...ctx.data.codeblock_named_contexts]
    : []
  ;

  let did_update = false;

  if (named_contexts.includes(old_name)) {
    ctx.data.codeblock_named_contexts = named_contexts.map((context_name) => {
      return context_name === old_name ? next_name : context_name;
    });
    did_update = true;
  }

  Object.values(ctx?.data?.context_items || {}).forEach((item_data) => {
    if (item_data?.from_named_context !== old_name) return;
    item_data.from_named_context = next_name;
    did_update = true;
  });

  if (!did_update) return false;

  ctx.emit_event('context:updated', {
    old_name,
    name: next_name,
    event_source: 'context_codeblock_utils.sync_renamed_named_context_to_codeblock',
  });

  return true;
}

/**
 * @param {import('smart-contexts').SmartContext} named_ctx
 * @param {import('smart-contexts').SmartContext} codeblock_ctx
 * @returns {Function}
 */
function register_direct_named_context_codeblock_rename_sync(named_ctx, codeblock_ctx) {
  if (typeof named_ctx?.on_event !== 'function' || !codeblock_ctx?.key) {
    return () => {};
  }

  if (!named_ctx._codeblock_rename_sync_disposers) {
    named_ctx._codeblock_rename_sync_disposers = {};
  }

  const existing_dispose = named_ctx._codeblock_rename_sync_disposers[codeblock_ctx.key];
  if (typeof existing_dispose === 'function') {
    existing_dispose();
  }

  const dispose = named_ctx.on_event('context:renamed', (payload = {}) => {
    sync_renamed_named_context_to_codeblock(codeblock_ctx, payload);
  });

  named_ctx._codeblock_rename_sync_disposers[codeblock_ctx.key] = () => {
    dispose?.();
    delete named_ctx._codeblock_rename_sync_disposers[codeblock_ctx.key];
  };

  return named_ctx._codeblock_rename_sync_disposers[codeblock_ctx.key];
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {string} [params.context_name]
 * @param {string} [params.source_path]
 * @param {Date} [params.now]
 * @returns {import('smart-contexts').SmartContext|null}
 */
export function create_named_context_from_codeblock(ctx, params = {}) {
  const smart_contexts = ctx?.env?.smart_contexts;
  if (!smart_contexts?.new_context) return null;

  const source_path = params.source_path || ctx?.key?.replace(/#codeblock$/, '') || '';
  const context_name = normalize_string(
    params.context_name
    || build_default_named_context_name(source_path, smart_contexts, params)
  );

  const payloads = get_active_codeblock_item_payloads(ctx);
  const named_ctx = smart_contexts.new_context({});
  named_ctx.name = context_name;

  if (payloads.length) {
    named_ctx.add_items(payloads);
  }

  sync_codeblock_context_to_named_context(ctx, {
    context_name,
    payloads,
  });
  register_direct_named_context_codeblock_rename_sync(named_ctx, ctx);

  return named_ctx;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @returns {import('smart-contexts').SmartContext|null}
 */
export function convert_codeblock_to_named_context(ctx, params = {}) {
  const named_ctx = create_named_context_from_codeblock(ctx, params);
  named_ctx?.emit_event?.('context_selector:open');
  return named_ctx;
}

/**
 * @param {any} env
 * @param {object} [params={}]
 * @param {string} [params.old_name]
 * @param {string} [params.name]
 * @returns {number}
 */
export function sync_renamed_named_context_to_codeblocks(env, params = {}) {
  const old_name = normalize_string(params.old_name);
  const next_name = normalize_string(params.name);
  if (!old_name || !next_name || old_name === next_name) return 0;

  const smart_contexts = env?.smart_contexts;
  const items = smart_contexts?.items ? Object.values(smart_contexts.items) : [];
  let updated_count = 0;

  items.forEach((ctx) => {
    if (!sync_renamed_named_context_to_codeblock(ctx, {
      old_name,
      name: next_name,
    })) {
      return;
    }
    updated_count += 1;
  });

  return updated_count;
}

/**
 * @param {any} env
 * @returns {Function}
 */
export function register_named_context_codeblock_rename_sync(env) {
  if (!env?.events?.on) return () => {};

  if (typeof env._dispose_context_codeblock_rename_sync === 'function') {
    return env._dispose_context_codeblock_rename_sync;
  }

  const dispose = env.events.on('context:renamed', async (payload = {}) => {
    sync_renamed_named_context_to_codeblocks(env, payload);
    await sync_renamed_named_context_to_note_codeblocks(env, payload);
  });

  env._dispose_context_codeblock_rename_sync = () => {
    dispose?.();
    env._dispose_context_codeblock_rename_sync = null;
  };

  return env._dispose_context_codeblock_rename_sync;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} params
 * @param {import('obsidian').Plugin} params.plugin
 * @param {string} params.source_path
 * @param {Function} [params.replace_code]
 * @param {HTMLElement} [params.codeblock_el]
 * @returns {Function}
 */
export function register_context_codeblock_sync_listener(ctx, params = {}) {
  if (typeof ctx?._dispose_codeblock_sync_listener === 'function') {
    ctx._dispose_codeblock_sync_listener();
  }

  const plugin = params.plugin || ctx?.env?.plugin;
  const source_path = String(params.source_path || '').trim();
  if (!plugin?.app || !source_path || typeof ctx?.on_event !== 'function') {
    return () => {};
  }

  let update_timeout = null;

  const write_update = async () => {
    const entries = build_codeblock_entries_for_ctx(ctx);
    const codeblock_contents = `${entries.join('\n')}\n`;

    const can_replace_rendered_code = typeof params.replace_code === 'function'
      && (!params.codeblock_el || params.codeblock_el.isConnected)
    ;

    if (can_replace_rendered_code) {
      try {
        params.replace_code(codeblock_contents);
        return;
      } catch (error) {
        console.error('context_codeblock: replaceCode failed', error);
      }
    }

    try {
      await replace_context_codeblock_contents_in_note(plugin.app, source_path, codeblock_contents);
    } catch (error) {
      console.error('context_codeblock: failed to sync codeblock contents', error);
    }
  };

  const dispose = ctx.on_event('context:updated', () => {
    if (update_timeout) clearTimeout(update_timeout);
    update_timeout = setTimeout(() => {
      update_timeout = null;
      write_update();
    }, 150);
  });

  const dispose_all = () => {
    if (update_timeout) clearTimeout(update_timeout);
    dispose?.();
  };

  ctx._dispose_codeblock_sync_listener = dispose_all;

  if (typeof plugin.register === 'function') {
    plugin.register(() => dispose_all());
  }

  return dispose_all;
}
