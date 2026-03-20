import { default_named_context_line_prefix } from './context_codeblock_constants.js';

/**
 * @param {string} value
 * @returns {string}
 */
function normalize_string(value = '') {
  return String(value ?? '').trim();
}

/**
 * @param {string} key
 * @returns {string}
 */
function normalize_item_key(key = '') {
  return normalize_string(key).replace(/^external:/, '');
}

/**
 * @param {string} item_key
 * @param {string} folder_path
 * @returns {boolean}
 */
function is_item_in_folder(item_key, folder_path) {
  const normalized_key = normalize_item_key(item_key);
  const normalized_folder = normalize_string(folder_path).replace(/\/+$/g, '');
  if (!normalized_key || !normalized_folder) return false;
  if (normalized_key === normalized_folder) return true;
  return normalized_key.startsWith(`${normalized_folder}/`);
}

/**
 * Keep only top-level folder paths.
 *
 * Example:
 * - `src`
 * - `src/utils`
 *
 * becomes:
 * - `src`
 *
 * @param {string[]} folder_paths
 * @returns {string[]}
 */
function get_unique_root_folder_paths(folder_paths = []) {
  const normalized_paths = folder_paths
    .map((folder_path) => normalize_item_key(folder_path))
    .filter(Boolean)
    .sort((left, right) => {
      if (left.length !== right.length) return left.length - right.length;
      return left.localeCompare(right);
    })
  ;

  return normalized_paths.reduce((acc, folder_path) => {
    if (acc.some((existing_path) => is_item_in_folder(folder_path, existing_path))) {
      return acc;
    }
    acc.push(folder_path);
    return acc;
  }, []);
}

/**
 * @param {string} context_name
 * @param {object} params
 * @param {string} [params.named_context_line_prefix]
 * @returns {string}
 */
function build_named_context_line(context_name, params = {}) {
  const normalized_name = normalize_string(context_name);
  if (!normalized_name) return '';
  const prefix = normalize_string(params.named_context_line_prefix) || default_named_context_line_prefix;
  return `${prefix}:: ${normalized_name}`;
}

/**
 * @param {string} key
 * @returns {string}
 */
function build_exclusion_line(key = '') {
  const normalized_key = normalize_item_key(key);
  if (!normalized_key) return '';
  return `!${normalized_key}`;
}

/**
 * @param {object} [params={}]
 * @param {Record<string, object>} [params.context_items]
 * @param {string[]} [params.codeblock_named_contexts]
 * @param {string[]} [params.passthrough_lines]
 * @param {string} [params.named_context_line_prefix]
 * @returns {string[]}
 */
export function build_codeblock_entries(params = {}) {
  const context_items = params.context_items && typeof params.context_items === 'object'
    ? params.context_items
    : {}
  ;
  const codeblock_named_contexts = Array.isArray(params.codeblock_named_contexts)
    ? params.codeblock_named_contexts
    : []
  ;
  const passthrough_lines = Array.isArray(params.passthrough_lines)
    ? params.passthrough_lines
    : []
  ;

  /** @type {string[]} */
  const entries = [];
  /** @type {string[]} */
  const folder_paths = [];
  /** @type {string[]} */
  const explicit_lines = [];
  /** @type {string[]} */
  const excluded_folder_paths = [];
  /** @type {string[]} */
  const excluded_explicit_lines = [];

  codeblock_named_contexts.forEach((context_name) => {
    const line = build_named_context_line(context_name, params);
    if (line) entries.push(line);
  });

  passthrough_lines.forEach((line) => {
    const normalized_line = normalize_string(line);
    if (normalized_line) entries.push(normalized_line);
  });

  Object.entries(context_items).forEach(([item_key, item_data]) => {
    if (!item_data || item_data.exclude) return;
    if (item_data.from_named_context) return;

    const folder_path = typeof item_data.folder === 'string'
      ? normalize_item_key(item_data.folder)
      : ''
    ;
    if (folder_path) {
      folder_paths.push(folder_path);
      return;
    }

    const explicit_line = normalize_item_key(item_data.key || item_key);
    if (!explicit_line) return;
    explicit_lines.push(explicit_line);
  });

  const folder_lines = get_unique_root_folder_paths(folder_paths);

  folder_lines.forEach((folder_line) => {
    entries.push(folder_line);
  });

  explicit_lines
    .filter((explicit_line) => {
      return !folder_lines.some((folder_line) => is_item_in_folder(explicit_line, folder_line));
    })
    .forEach((explicit_line) => {
      entries.push(explicit_line);
    })
  ;

  Object.entries(context_items).forEach(([item_key, item_data]) => {
    if (!item_data?.exclude) return;

    const exclusion_key = normalize_item_key(item_data.key || item_key);
    if (!exclusion_key) return;

    if (item_data.folder === true) {
      excluded_folder_paths.push(exclusion_key);
      return;
    }

    excluded_explicit_lines.push(exclusion_key);
  });

  const excluded_folder_lines = get_unique_root_folder_paths(excluded_folder_paths);

  excluded_folder_lines.forEach((folder_line) => {
    const exclusion_line = build_exclusion_line(folder_line);
    if (exclusion_line) entries.push(exclusion_line);
  });

  excluded_explicit_lines
    .filter((excluded_line) => {
      return !excluded_folder_lines.some((folder_line) => is_item_in_folder(excluded_line, folder_line));
    })
    .forEach((excluded_line) => {
      const exclusion_line = build_exclusion_line(excluded_line);
      if (exclusion_line) entries.push(exclusion_line);
    })
  ;

  return entries.filter(Boolean).filter((entry, index, arr) => arr.indexOf(entry) === index);
}

export default build_codeblock_entries;
