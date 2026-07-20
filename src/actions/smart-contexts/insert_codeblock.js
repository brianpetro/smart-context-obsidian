import { default_context_codeblock_type } from '../../utils/context_codeblock_constants.js';
import {
  ensure_context_codeblock_in_editor,
  get_context_codeblock_ctx_key,
  open_context_selector_for_codeblock,
} from '../../utils/context_codeblock_utils.js';

/**
 * Insert a Smart Context codeblock and open its context selector.
 *
 * @this {import('smart-contexts').SmartContexts}
 * @param {object} [params={}]
 * @param {CodeMirror.Editor} params.editor
 * @param {string} params.source_path
 * @returns {boolean}
 */
export function smart_contexts_insert_codeblock(params = {}) {
  const {
    editor,
    source_path,
    event_source,
  } = params;

  if (!editor || !source_path) return false;

  ensure_context_codeblock_in_editor(editor, {
    codeblock_type: default_context_codeblock_type,
  });

  const ctx_key = get_context_codeblock_ctx_key(source_path);
  const ctx = this.get(ctx_key) || this.new_context({ key: ctx_key });
  ctx.data.codeblock_type = default_context_codeblock_type;

  open_context_selector_for_codeblock(ctx, {
    event_source,
  });
  return true;
}

export const commands = {
  'external-file-codeblock': {
    name: 'Insert codeblock (add notes & named contexts)',
    context: 'editor',

    register_when({ plugin }) {
      return plugin.manifest.id === 'smart-context';
    },

    params({ editor, editor_ctx }) {
      return {
        editor,
        source_path: editor_ctx?.file?.path || '',
      };
    },

    get_scope({ env }) {
      return env.smart_contexts;
    },

    when({ params, scope }) {
      return Boolean(
        scope
        && params.editor
        && params.source_path
      );
    },
  },
};
