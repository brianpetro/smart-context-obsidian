import { get_selected_context_item_keys } from '../../utils/get_selected_context_item_keys.js';
import { get_selected_folder_paths } from '../../utils/folder_selection.js';

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
function get_selection_item_keys(env, files = []) {
  return get_selected_context_item_keys(files, env.smart_sources);
}

/**
 * Open selected file-nav files/folders in Context Builder.
 *
 * @this {import('obsidian-smart-env').SmartEnv}
 * @param {object} [params={}]
 * @param {Array<object>} [params.files]
 * @returns {boolean}
 */
export function env_open_file_selection_in_context_builder(params = {}) {
  const files = get_selection(params);
  const add_items = get_selection_item_keys(this, files);
  const ctx = this.smart_contexts.new_context({}, { add_items });
  ctx.emit_event('context_selector:open');
  return true;
}

export const menus = {
  'env:files_menu': {
    title: 'Open selection in Context Builder',
    icon: 'layout-list',
    order: 10,
    when() {
      const files = get_selection(this.params);
      return get_selection_item_keys(this.scope, files).length > 0
        || get_selected_folder_paths(files).length > 0
      ;
    },
  },
};
