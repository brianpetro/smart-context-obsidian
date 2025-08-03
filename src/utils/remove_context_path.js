/**
 * remove_context_path
 * Removes a path and any descendant paths from a context_items map.
 * @param {Record<string, unknown>} context_items
 * @param {string} path
 * @returns {Record<string, unknown>}
 */
export const remove_context_path = (context_items = {}, path = '') => {
  const entries = Object.entries(context_items).filter(([key]) => {
    return !(key === path || key.startsWith(`${path}/`) || key.startsWith(`${path}#`));
  });
  return Object.fromEntries(entries);
};
