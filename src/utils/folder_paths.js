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
