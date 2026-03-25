import { context_codeblock_types } from './context_codeblock_constants.js';
import {
  get_context_codeblock_ctx_key,
} from './context_codeblock_utils.js';
import { build_codeblock_entries } from './build_codeblock_entries.js';

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
              mpp_ctx.replaceCode(updated_cb_content.join('\n') + '\n');
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
