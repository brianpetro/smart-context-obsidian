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
