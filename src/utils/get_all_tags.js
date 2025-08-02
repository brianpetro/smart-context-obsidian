/**
 * Extract all unique tag names in the vault.
 *
 * @param {import('obsidian').App} app - Active Obsidian app instance
 * @returns {string[]} Array of tag strings (includes leading #)
 */
export function get_all_tags(app) {
  const tag_map = app.metadataCache.getTags();
  return Object.keys(tag_map);
}
