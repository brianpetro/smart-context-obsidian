import { is_text_file } from 'smart-file-system/utils/ignore';
import { get_all_leaves } from './get_all_leaves';

/**
 * Collect all open files in the workspace.
 */
export function get_all_open_file_paths(app) {
  const leaves = get_all_leaves(app);
  const files_set = [];
  for (const leaf of leaves) {
    const file_path = leaf.view?.state?.file ?? leaf.view?.file?.path;
    if (file_path && is_text_file(file_path)) {
      files_set.push(file_path);
    }
  }
  return files_set;
}
