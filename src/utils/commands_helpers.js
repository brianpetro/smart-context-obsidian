import {
  get_or_create_codeblock_context_from_note,
} from './context_codeblock_utils.js';
import { build_copy_current_context } from './temp_context_utils.js';

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
 * Resolve the shared dependencies needed by copy-current commands.
 *
 * @param {object} env
 * @param {object} [params={}]
 * @param {string=} params.source_path
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

  const modal_class = env.config?.modals?.copy_context_modal?.class;
  if (!modal_class) return null;

  return {
    source_path,
    source,
    modal_class,
  };
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
 * @param {Function} params.parse_codeblock
 * @param {string} [params.markdown]
 * @param {boolean} [params.with_media=false]
 * @returns {Promise<boolean>}
 */
export async function open_copy_current_modal(plugin, params = {}) {
  const {
    source_path,
    source,
    modal_class,
    parse_codeblock,
    markdown,
    with_media = false,
  } = params;

  if (!plugin?.env || !source_path || !source || typeof modal_class !== 'function') {
    return false;
  }

  if (typeof parse_codeblock !== 'function') {
    plugin.env?.events?.emit?.('context:copy_missing_codeblock_parser', {
      level: 'error',
      message: 'Missing codeblock parser for copy-current flow.',
      event_source: 'copy_current_command_utils.open_copy_current_modal',
    });
    return false;
  }

  try {
    const ctx = await source.actions.source_get_context();
    if (!ctx) {
      plugin.env?.events?.emit?.('context:build_failed', {
        level: 'error',
        message: 'Failed to build context for current note.',
        event_source: 'copy_current_command_utils.open_copy_current_modal',
      });
      return false;
    }

    const codeblock_ctx = await get_or_create_codeblock_context_from_note(plugin, source_path, {
      markdown,
      parse_codeblock,
    });
    const copy_ctx = build_copy_current_context(ctx, {
      codeblock_ctx,
      key: `${source_path}#copy_current`,
    }) || ctx;

    const modal = new modal_class(copy_ctx, with_media ? { with_media: true } : undefined);
    modal.open();
    return true;
  } catch (error) {
    console.error('open_copy_current_modal failed', error);
    plugin.env?.events?.emit?.('context:build_failed', {
      level: 'error',
      message: 'Failed to build context for current note.',
      details: error?.message || '',
      event_source: 'copy_current_command_utils.open_copy_current_modal',
    });
    return false;
  }
}
