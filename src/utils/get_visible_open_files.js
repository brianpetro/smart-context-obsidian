import { is_text_file } from 'smart-file-system/utils/ignore';
import { get_all_leaves } from './get_all_leaves';
import { is_leaf_visible } from './is_leaf_visible';

/**
 * Collect only visible open files.
 */
export function get_visible_open_files(app) {
  const leaves = get_all_leaves(app);
  const visible_files = new Set();
  for (const leaf of leaves) {
    if (!is_leaf_visible(leaf)) continue;
    const file = leaf.view?.file;
    if (file && is_text_file(file.path)) {
      visible_files.add(file);
    }
  }
  return visible_files;
}
