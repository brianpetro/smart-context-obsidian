import { is_text_file } from 'smart-file-system/utils/ignore.js';
import { get_all_leaves } from './get_all_leaves.js';

/**
 * Collect all open files in the workspace.
 */
export function get_all_open_file_paths(app) {
  const leaves = get_all_leaves(app);
  const files = new Set();
  for (const leaf of leaves) {
    const file_path = leaf.view?.state?.file ?? leaf.view?.file?.path;
    if (file_path && is_text_file(file_path)) {
      files.add(file_path);
    }
  }
  return [...files];
}
