import { parse_codeblock_to_context_items } from '../utils/parse_codeblock_to_context_items.js';
import { context_codeblock_types } from '../utils/context_codeblock_constants.js';
import {
  get_context_codeblock_ctx_key,
  register_context_codeblock_sync_listener,
  register_named_context_codeblock_rename_sync,
} from '../utils/context_codeblock_utils.js';

/**
 * @param {import('smart-contexts').SmartContext} smart_context
 * @param {object} [params={}]
 * @param {object[]} [params.context_items]
 * @param {string[]} [params.named_contexts]
 * @param {string[]} [params.passthrough_lines]
 * @returns {void}
 */
function hydrate_codeblock_context(smart_context, params = {}) {
  const context_items = Array.isArray(params.context_items) ? params.context_items : [];
  smart_context.data.context_items = {};
  smart_context.data.codeblock_named_contexts = Array.isArray(params.named_contexts)
    ? [...params.named_contexts]
    : []
  ;
  smart_context.data.codeblock_passthrough_lines = Array.isArray(params.passthrough_lines)
    ? [...params.passthrough_lines]
    : []
  ;

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
 * Register markdown processors for context codeblock aliases.
 * @param {object} plugin
 */
export function register_smart_context_codeblock(plugin) {
  const env = plugin.env;
  if (!env || plugin._smart_context_codeblock_registered) return;
  plugin._smart_context_codeblock_registered = true;

  const rename_sync_disposer = register_named_context_codeblock_rename_sync(env);
  if (typeof plugin.register === 'function' && typeof rename_sync_disposer === 'function') {
    plugin.register(() => rename_sync_disposer());
  }

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

        const {
          cb_hash,
          context_items,
          named_contexts,
          passthrough_lines,
        } = parse_codeblock_to_context_items(cb_content, {
          smart_contexts: env.smart_contexts,
        });

        if (smart_context._cb_hash !== cb_hash) {
          smart_context._cb_hash = cb_hash;
          hydrate_codeblock_context(smart_context, {
            context_items,
            named_contexts,
            passthrough_lines,
          });
        }

        try {
          const container = await env.smart_components.render_component('context_codeblock', smart_context);
          el.empty();
          el.appendChild(container);
        } catch (error) {
          console.error('context_codeblock render error', error);
          el.createEl('pre', { text: error?.message || 'Failed to render context codeblock.' });
        }

        register_context_codeblock_sync_listener(smart_context, {
          plugin,
          source_path,
          replace_code: mpp_ctx?.replaceCode,
          codeblock_el: el,
        });
      },
    );
  });
}
