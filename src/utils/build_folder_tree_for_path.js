import { build_file_tree_string } from 'smart-utils/file_tree.js';

/**
 * Build an ASCII tree for a folder using Smart Context file system data.
 *
 * @param {string} folder_path
 * @param {string[]} file_paths
 * @param {string[]} folder_paths
 * @returns {string}
 */
export function build_folder_tree_for_path(folder_path = '', file_paths = [], folder_paths = []) {
  const normalized_folder = typeof folder_path === 'string'
    ? folder_path.replace(/\/+$/, '')
    : '';
  const prefix = normalized_folder ? `${normalized_folder}/` : '';
  const is_within_folder = (target) => {
    if (!normalized_folder) return true;
    return target === normalized_folder || target.startsWith(prefix);
  };

  const tree_paths = new Set();

  if (normalized_folder) {
    tree_paths.add(`${normalized_folder}/`);
  }

  folder_paths
    .filter(Boolean)
    .map((path) => path.replace(/\/+$/, ''))
    .filter(is_within_folder)
    .forEach((path) => {
      const entry = path.endsWith('/') ? path : `${path}/`;
      tree_paths.add(entry);
    });

  file_paths
    .filter(Boolean)
    .filter(is_within_folder)
    .forEach((path) => tree_paths.add(path));

  if (!tree_paths.size) return '';

  return build_file_tree_string([...tree_paths]);
}
