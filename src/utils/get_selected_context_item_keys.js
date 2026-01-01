import { expand_folders_to_item_keys } from './folder_selection.js';

/**
 * Extract Smart Context item keys for file explorer selections.
 *
 * Supports:
 *  - Files:
 *      - Markdown: prefer smart_sources.get(path).key, fall back to the path.
 *      - Media (images + PDFs): use the path (ContextItem adapters detect by extension).
 *      - Other: only include when smart_sources.get(path) resolves.
 *  - Folders:
 *      Expands folder selections by using smart_sources.filter({ key_starts_with })
 *      to include items *inside* the folder.
 *
 * Folders are identified by the presence of `children` (matches Obsidian's TFolder shape).
 * Deduplicates while preserving order.
 *
 * @param {Array<{path?: string, extension?: string, children?: unknown}>} files
 * @param {{
 *   get?: (path: string) => { key: string } | null | undefined,
 *   filter?: (query: { key_starts_with?: string }) => Array<{ key?: string }> | null | undefined
 * }} smart_sources
 * @returns {string[]}
 */
export function get_selected_context_item_keys(files = [], smart_sources) {
  if (!Array.isArray(files)) return [];

  const seen = new Set();
  /** @type {string[]} */
  const keys = [];

  for (const file of files) {
    const is_folder = Array.isArray(file?.children);

    if (is_folder) {
      const folder_path = file?.path;
      const folder_item_keys = expand_folders_to_item_keys([folder_path], smart_sources);
      for (const key of folder_item_keys) {
        if (!key || seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
      }
      continue;
    }

    const file_path = file?.path;
    if (!file_path) continue;

    const ext = (file?.extension?.toLowerCase?.() || '').trim();

    let key = null;

    if (ext === 'md') {
      const src = smart_sources?.get?.(file_path);
      key = src?.key || file_path;
    } else if (ext === 'pdf' || is_supported_image_extension(ext)) {
      key = file_path;
    } else {
      const src = smart_sources?.get?.(file_path);
      key = src?.key || null;
    }

    if (!key) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    keys.push(key);
  }

  return keys;
}

/**
 * Keep this list intentionally conservative (no mp4).
 *
 * @param {string} ext
 * @returns {boolean}
 */
function is_supported_image_extension(ext) {
  const safe_image_exts = new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'bmp',
    'webp',
    'svg',
    'ico',
    'avif',
  ]);

  return safe_image_exts.has(String(ext || '').toLowerCase());
}
