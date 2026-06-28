import { get_selected_note_keys } from '../../utils/get_selected_note_keys.js';

/**
 * @param {object} [params={}]
 * @returns {Array<object>}
 */
function get_selection(params = {}) {
  return Array.isArray(params.files) ? params.files : [];
}

/**
 * @param {import('obsidian-smart-env').SmartEnv} env
 * @param {Array<object>} files
 * @returns {string[]}
 */
function get_selected_keys(env, files = []) {
  return get_selected_note_keys(files, env.smart_sources);
}

/**
 * Copy selected file-nav notes to clipboard as Smart Context text.
 *
 * @this {import('obsidian-smart-env').SmartEnv}
 * @param {object} [params={}]
 * @param {Array<object>} [params.files]
 * @returns {Promise<boolean>}
 */
export async function env_copy_selected_notes_to_clipboard(params = {}) {
  const add_items = get_selected_keys(this, get_selection(params));
  if (!add_items.length) {
    this.events?.emit('context:copy_selection_empty', {
      level: 'warning',
      message: 'No Smart Context notes found in selection.',
      event_source: 'copy_selected_files_to_clipboard',
    });
    return false;
  }

  const ctx = this.smart_contexts.new_context({}, { add_items });
  ctx.emit_event?.('context:file_nav_copied');
  return await ctx.actions.context_copy_to_clipboard();
}

export const menus = {
  'env:files_menu': {
    title: 'Copy selected notes as context',
    icon: 'documents',
    order: 20,
    when() {
      return get_selected_keys(this.scope, get_selection(this.params)).length > 1;
    },
  },
};
