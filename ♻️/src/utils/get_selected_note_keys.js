/**
 * Extract Smart Context keys for markdown files selected in the file explorer.
 *
 * @param {Array<{path?: string, extension?: string}>} files
 * @param {{ get(path: string): { key: string } | null | undefined }} smart_sources
 * @returns {string[]}
 */
export function get_selected_note_keys(files = [], smart_sources) {
  if (!Array.isArray(files) || !smart_sources?.get) return [];

  const seen = new Set();

  return files.reduce((keys, file) => {
    const ext = file?.extension?.toLowerCase?.();
    if (ext !== 'md') return keys;

    const path = file?.path;
    if (!path || seen.has(path)) return keys;

    const source = smart_sources.get(path);
    if (!source?.key) return keys;

    seen.add(path);
    keys.push(source.key);
    return keys;
  }, []);
}
