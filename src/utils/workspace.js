import { is_text_file } from 'smart-file-system/utils/ignore.js';
/**
 * Recursively gather workspace leaves.
 */
export function get_all_leaves(app) {
  const leaves = [];
  const recurse = (container) => {
    if (container.children) {
      for (const child of container.children) {
        recurse(child);
      }
    }
    if (container.type === 'leaf') {
      leaves.push(container);
    }
  };
  recurse(app.workspace.rootSplit);
  return leaves;
}

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
  return [...visible_files].map(file => file.path);
}
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

/**
 * Is a leaf the active tab in its parent container?
 */
export function is_leaf_visible(leaf) {
  const parent = leaf.parent;
  if (!parent) {
    return leaf.containerEl && leaf.containerEl.offsetParent !== null;
  }
  if ('activeTab' in parent) {
    return (
      parent.activeTab === leaf &&
      leaf.containerEl &&
      leaf.containerEl.offsetParent !== null
    );
  }
  return leaf.containerEl && leaf.containerEl.offsetParent !== null;
}
