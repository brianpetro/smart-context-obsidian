import { MarkdownView } from 'obsidian';
import {
  context_codeblock_types,
  default_context_codeblock_type,
} from './context_codeblock_constants.js';
import { escape_regex } from './pure_utils.js';


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
 * @param {string} source_path
 * @returns {string}
 */
export function get_context_codeblock_ctx_key(source_path = '') {
  return `${String(source_path || '').trim()}#codeblock`;
}
/**
 * Hydrate a codeblock context on demand from note contents.
 *
 * @param {import('obsidian').Plugin} plugin
 * @param {string} source_path
 * @param {object} [params={}]
 * @param {string} [params.markdown]
 * @returns {Promise<import('smart-contexts').SmartContext|null>}
 */
export async function get_or_create_codeblock_context_from_note(plugin, source_path, params = {}) {
  const smart_contexts = plugin?.env?.smart_contexts;
  if (!smart_contexts?.new_context || !source_path) return null;

  const markdown = typeof params.markdown === 'string'
    ? params.markdown
    : await read_note_markdown(plugin?.app, source_path)
  ;
  if (!markdown) return null;

  const snapshot = get_context_codeblock_snapshot(markdown);
  if (!snapshot) return null;

  const ctx_key = get_context_codeblock_ctx_key(source_path);
  const smart_context = smart_contexts.get(ctx_key) || smart_contexts.new_context({ key: ctx_key });
  smart_context.actions.context_parse_codeblock({ cb_content: snapshot.cb_content });


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
function find_context_codeblock_range(lines = []) {
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
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {string[]}
 */
function get_context_codeblock_suggest_action_keys(ctx) {
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

