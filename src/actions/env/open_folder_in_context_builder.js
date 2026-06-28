import { normalize_folder_prefix } from '../../utils/folder_selection.js';

/**
 * @param {object} [params={}]
 * @returns {object|null}
 */
function get_folder(params = {}) {
  return params.folder || params.file || null;
}

/**
 * @param {import('obsidian-smart-env').SmartEnv} env
 * @param {{ path?: string }|null} folder
 * @returns {string[]}
 */
function get_folder_item_keys(env, folder) {
  const folder_prefix = normalize_folder_prefix(folder?.path);
  if (!folder_prefix) return [];

  return env.smart_sources
    .filter({ key_starts_with: folder_prefix })
    .map((src) => src.key)
  ;
}

/**
 * Open the selected file-nav folder in Context Builder.
 *
 * @this {import('obsidian-smart-env').SmartEnv}
 * @param {object} [params={}]
 * @param {{ path?: string }} [params.folder]
 * @param {{ path?: string }} [params.file]
 * @returns {boolean}
 */
export function env_open_folder_in_context_builder(params = {}) {
  const folder = get_folder(params);
  if (!folder?.path) return false;

  const add_items = get_folder_item_keys(this, folder);
  const ctx = this.smart_contexts.new_context({}, { add_items });
  ctx.emit_event('context_selector:open');
  return true;
}

export const menus = {
  'env:folder_menu': {
    title: 'Open folder in Context Builder',
    icon: 'layout-list',
    order: 20,
    when() {
      return Boolean(get_folder(this.params)?.path);
    },
  },
};
