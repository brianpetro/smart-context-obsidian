import { MarkdownView } from 'obsidian';
import { context_codeblock_types } from './context_codeblock_constants.js';
import {
  get_context_codeblock_ctx_key,
} from './context_codeblock_utils.js';
import { build_codeblock_entries } from './build_codeblock_entries.js';

/**
 * @param {string} line
 * @returns {boolean}
 */
function is_context_codeblock_fence(line = '') {
  const normalized_line = String(line || '').trim();
  return context_codeblock_types.some((codeblock_type) => {
    return normalized_line === `\`\`\`${codeblock_type}`;
  });
}

/**
 * @param {string} markdown
 * @returns {{ start: number, end: number } | null}
 */
function find_context_codeblock_range(markdown = '') {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  let start = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '').trim();

    if (start === -1) {
      if (!is_context_codeblock_fence(line)) continue;
      start = i;
      continue;
    }

    if (/^\`\`\`\s*$/.test(line)) {
      return {
        start,
        end: i,
      };
    }
  }

  return null;
}

/**
 * @param {object} plugin
 * @param {string} source_path
 * @param {string} cb_content
 * @returns {Promise<boolean>}
 */
async function sync_context_codeblock(plugin, source_path, cb_content) {
  const app = plugin?.app;
  if (!app || !source_path) return false;

  const active_view = app.workspace?.getActiveViewOfType?.(MarkdownView);
  if (active_view?.file?.path === source_path && active_view.editor) {
    const markdown = active_view.editor.getValue();
    const range = find_context_codeblock_range(markdown);
    if (!range) return false;

    active_view.editor.replaceRange(
      cb_content,
      { line: range.start + 1, ch: 0 },
      { line: range.end, ch: 0 },
    );
    return true;
  }

  const file = app.vault.getFileByPath?.(source_path)
    || app.vault.getAbstractFileByPath?.(source_path)
  ;
  if (!file) return false;

  const markdown = await app.vault.read(file);
  const range = find_context_codeblock_range(markdown);
  if (!range) return false;

  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const next_lines = [
    ...lines.slice(0, range.start + 1),
    ...String(cb_content || '').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n'),
    ...lines.slice(range.end),
  ];
  const next_markdown = next_lines.join('\n').replace(/\n/g, newline);

  await app.vault.modify(file, next_markdown);
  return true;
}

/**
 * Register markdown processors for all context codeblock aliases.
 *
 * Shared by Core and Pro so codeblock lifecycle behavior stays identical
 * while each plugin can inject its own parser.
 *
 * @param {object} plugin
 * @returns {void}
 */
export function register_context_codeblock_processors(plugin) {
  const env = plugin?.env;

  if (!env || plugin?._smart_context_codeblock_registered) return;

  plugin._smart_context_codeblock_registered = true;

  context_codeblock_types.forEach((codeblock_type) => {
    plugin.registerMarkdownCodeBlockProcessor(
      codeblock_type,
      async (cb_content, el, mpp_ctx) => {
        const source_path = mpp_ctx?.sourcePath;
        if (!source_path) return;

        const ctx_key = get_context_codeblock_ctx_key(source_path);
        let smart_context = env.smart_contexts.get(ctx_key);
        if (!smart_context) {
          smart_context = env.smart_contexts.new_context({ key: ctx_key });
        }
        smart_context.data.codeblock_type = codeblock_type;

        smart_context.actions.context_parse_codeblock({ cb_content });


        // HANDLE WHEN CONTEXT ITEMS CHANGE
        if (!smart_context._update_disposer) {
          smart_context._update_disposer = smart_context.on_event('context:updated', async () => {
            const updated_cb_content = build_codeblock_entries(smart_context.data);
            try {
              const did_sync = await sync_context_codeblock(
                plugin,
                source_path,
                updated_cb_content.join('\n') + '\n',
              );
              if (!did_sync) {
                throw new Error('Unable to find context codeblock in source note');
              }
            } catch (error) {
              smart_context.emit_error_event('context_codeblock:update', { message: 'Failed to update codeblock content', error_message: error?.message });
              console.error('Failed to update context codeblock content', { error, mpp_ctx, smart_context });
              smart_context._update_disposer?.();
              smart_context._update_disposer = null;
            }
          });
          plugin.register(() => {
            smart_context._update_disposer?.();
          });
        }

        try {
          const container = await env.smart_components.render_component('context_codeblock', smart_context);
          el.empty();
          el.appendChild(container);
        } catch (error) {
          console.error('context_codeblock render error', error);
          el.createEl('pre', {
            text: error?.message || 'Failed to render context codeblock.',
          });
        }
      },
    );
  });
}

export default register_context_codeblock_processors;
