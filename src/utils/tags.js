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
/**
 * Return all markdown file paths containing the provided tag.
 *
 * @param {import('obsidian').App} app
 * @param {string} tag - Tag name including leading '#'
 * @returns {string[]}
 */
export function get_files_with_tag(app, tag) {
  const files = app.vault.getMarkdownFiles();
  const result = [];
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const tags = [
      ...(cache?.tags?.map((t) => t.tag) || []),
      ...(cache?.frontmatter?.tags || [])
    ].map(t => t.startsWith('#') ? t : `#${t}`);
    if (tags.includes(tag)) result.push(file.path);
  }
  return result;
}

