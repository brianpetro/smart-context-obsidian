import { expand_folders_to_item_keys } from '../../utils/folder_selection.js';

/**
 * @param {object} [params={}]
 * @returns {object|null}
 */
function get_folder(params = {}) {
  return params.folder || params.file || null;
}

/**
 * Copy the selected file-nav folder contents to clipboard as Smart Context text.
 *
 * @this {import('obsidian-smart-env').SmartEnv}
 * @param {object} [params={}]
 * @param {{ path?: string }} [params.folder]
 * @param {{ path?: string }} [params.file]
 * @returns {Promise<boolean>}
 */
export async function env_copy_folder_to_clipboard(params = {}) {
  const folder = get_folder(params);
  const add_items = expand_folders_to_item_keys([folder?.path], this.smart_sources);

  const ctx = this.smart_contexts.new_context({}, { add_items });
  ctx.emit_event?.('context:file_nav_copied');
  return await ctx.actions.context_copy_to_clipboard();
}

export const menus = {
  'env:folder_menu': {
    title: 'Copy folder contents to clipboard',
    icon: 'documents',
    order: 10,
    when() {
      return Boolean(get_folder(this.params)?.path);
    },
  },
};
