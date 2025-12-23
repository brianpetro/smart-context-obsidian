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
      const folder_prefix = normalize_folder_prefix(folder_path);
      if (!folder_prefix) continue;

      const folder_item_keys = resolve_folder_item_keys(folder_prefix, smart_sources);
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
 * Resolve item keys inside a selected folder using smart_sources.filter().
 *
 * @param {string} folder_prefix must end with '/'
 * @param {any} smart_sources
 * @returns {string[]}
 */
function resolve_folder_item_keys(folder_prefix, smart_sources) {
  if (!folder_prefix) return [];
  if (!smart_sources || typeof smart_sources.filter !== 'function') return [];

  try {
    const matches = smart_sources.filter({ key_starts_with: folder_prefix });
    if (!Array.isArray(matches)) return [];

    return matches
      .map((src) => src?.key)
      .filter((k) => typeof k === 'string' && k.length > 0);
  } catch (err) {
    console.warn('get_selected_context_item_keys: smart_sources.filter failed', err);
    return [];
  }
}

/**
 * Ensure folder prefix matches only items *inside* the folder.
 * Prevents accidental matches like:
 *   folder "foo" matching "foobar/file.md"
 *
 * @param {string} folder_path
 * @returns {string}
 */
function normalize_folder_prefix(folder_path) {
  const raw = String(folder_path ?? '').trim();
  if (!raw) return '';
  return raw.endsWith('/') ? raw : `${raw}/`;
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
