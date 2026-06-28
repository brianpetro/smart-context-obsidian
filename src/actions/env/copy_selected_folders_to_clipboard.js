import {
  expand_folders_to_item_keys,
  get_selected_folder_paths,
} from '../../utils/folder_selection.js';

/**
 * @param {object} [params={}]
 * @returns {Array<object>}
 */
function get_selection(params = {}) {
  return Array.isArray(params.files) ? params.files : [];
}

/**
 * Copy selected file-nav folders to clipboard as Smart Context text.
 *
 * @this {import('obsidian-smart-env').SmartEnv}
 * @param {object} [params={}]
 * @param {Array<object>} [params.files]
 * @returns {Promise<boolean>}
 */
export async function env_copy_selected_folders_to_clipboard(params = {}) {
  const folder_paths = get_selected_folder_paths(get_selection(params));
  if (!folder_paths.length) {
    this.events?.emit('context:copy_selection_empty', {
      level: 'warning',
      message: 'No folders found in selection.',
      event_source: 'copy_selected_folders_to_clipboard',
    });
    return false;
  }

  const add_items = expand_folders_to_item_keys(folder_paths, this.smart_sources);
  if (!add_items.length) {
    this.events?.emit('context:copy_selection_empty', {
      level: 'warning',
      message: 'No Smart Context notes found in selected folders.',
      event_source: 'copy_selected_folders_to_clipboard',
    });
    return false;
  }

  const ctx = this.smart_contexts.new_context({}, { add_items });
  ctx.emit_event?.('context:file_nav_copied');
  return await ctx.actions.context_copy_to_clipboard();
}

export const menus = {
  'env:files_menu': {
    title: 'Copy selected folders as context',
    icon: 'documents',
    order: 30,
    when() {
      return get_selected_folder_paths(get_selection(this.params)).length > 1;
    },
  },
};
