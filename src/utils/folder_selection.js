/**
 * Ensure folder prefix matches only items inside the folder.
 * Prevents accidental matches like:
 *   folder "foo" matching "foobar/file.md"
 *
 * @param {string} folder_path
 * @returns {string}
 */
export function normalize_folder_prefix(folder_path) {
  const raw = String(folder_path ?? '').trim();
  if (!raw) return '';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/**
 * Extract unique folder paths selected in the file explorer.
 *
 * Obsidian supplies an array of TAbstractFile entries to the `files-menu` event.
 * TFolder instances include a `children` array; TFile instances do not.
 *
 * Kept dependency-free so it can be unit tested without Obsidian runtime.
 *
 * @param {Array<{path?: string, children?: unknown}>} files
 * @returns {string[]}
 */
export function get_selected_folder_paths(files = []) {
  if (!Array.isArray(files)) return [];

  const seen = new Set();
  /** @type {string[]} */
  const paths = [];

  for (const file of files) {
    const is_folder = Array.isArray(file?.children);
    if (!is_folder) continue;

    const folder_path = file?.path;
    if (!folder_path || seen.has(folder_path)) continue;

    seen.add(folder_path);
    paths.push(folder_path);
  }

  return paths;
}

/**
 * Expand folder selections into Smart Source item keys.
 *
 * @param {string[]} folder_paths
 * @param {{ filter?: (query: { key_starts_with?: string }) => Array<{ key?: string }> }} smart_sources
 * @returns {string[]}
 */
export function expand_folders_to_item_keys(folder_paths = [], smart_sources) {
  if (!Array.isArray(folder_paths) || folder_paths.length === 0) return [];
  if (!smart_sources || typeof smart_sources.filter !== 'function') return [];

  const seen = new Set();
  /** @type {string[]} */
  const keys = [];

  for (const folder_path of folder_paths) {
    const prefix = normalize_folder_prefix(folder_path);
    if (!prefix) continue;

    try {
      const matches = smart_sources.filter({ key_starts_with: prefix });
      if (!Array.isArray(matches)) continue;

      for (const match of matches) {
        const key = match?.key;
        if (!key || seen.has(key) || !key.startsWith(prefix)) continue;
        seen.add(key);
        keys.push(key);
      }
    } catch (err) {
      console.warn('expand_folders_to_item_keys: smart_sources.filter failed', err);
      return [];
    }
  }

  return keys;
}
