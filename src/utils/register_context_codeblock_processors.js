import { context_codeblock_types } from './context_codeblock_constants.js';
import {
  apply_parsed_codeblock_context,
  get_context_codeblock_ctx_key,
} from './context_codeblock_utils.js';

/**
 * Register markdown processors for all context codeblock aliases.
 *
 * Shared by Core and Pro so codeblock lifecycle behavior stays identical
 * while each plugin can inject its own parser.
 *
 * @param {object} plugin
 * @param {object} params
 * @param {(cb_content: string, params: {
 *   plugin: object,
 *   env: any,
 *   source_path: string,
 *   codeblock_type: string,
 *   mpp_ctx: any,
 * }) => (Promise<object>|object)} params.parse_codeblock
 * @returns {void}
 */
export function register_context_codeblock_processors(plugin, params = {}) {
  const env = plugin?.env;
  const parse_codeblock = params.parse_codeblock;

  if (!env || plugin?._smart_context_codeblock_registered) return;
  if (typeof parse_codeblock !== 'function') {
    console.warn('register_context_codeblock_processors: parse_codeblock callback required');
    return;
  }

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

        const parsed_result = await parse_codeblock(cb_content, {
          plugin,
          env,
          source_path,
          codeblock_type,
          mpp_ctx,
        });
        const parsed = parsed_result && typeof parsed_result === 'object'
          ? parsed_result
          : {}
        ;

        if (smart_context._cb_hash !== parsed.cb_hash) {
          apply_parsed_codeblock_context(smart_context, {
            codeblock_type,
            ...parsed,
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
