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
