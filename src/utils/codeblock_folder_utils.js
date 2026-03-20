import { normalize_folder_prefix } from './folder_selection.js';

/**
 * Normalize a codeblock path value.
 *
 * - trims whitespace
 * - normalizes path separators to `/`
 * - removes trailing slashes
 *
 * @param {string} value
 * @returns {string}
 */
export function normalize_codeblock_path(value = '') {
  return String(value ?? '')
    .trim()
    .replace(/\\+/g, '/')
    .replace(/\/+$/g, '');
}

/**
 * Escape a string for regex construction.
 *
 * @param {string} value
 * @returns {string}
 */
function escape_regex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Basic glob support for codeblock exclusion lines.
 *
 * Supports:
 * - `*`
 * - `?`
 *
 * This intentionally stays conservative because the codeblock docs describe
 * these as "basic" glob patterns.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function is_basic_glob_pattern(value = '') {
  return /[*?]/.test(String(value ?? '').trim());
}

/**
 * Convert a basic glob pattern to a RegExp.
 *
 * @param {string} pattern
 * @returns {RegExp|null}
 */
function build_basic_glob_regex(pattern = '') {
  const normalized_pattern = String(pattern ?? '').trim();
  if (!normalized_pattern) return null;

  let regex_body = '^';

  for (let i = 0; i < normalized_pattern.length; i += 1) {
    const char = normalized_pattern[i];

    if (char === '*') {
      regex_body += '.*';
      continue;
    }

    if (char === '?') {
      regex_body += '.';
      continue;
    }

    regex_body += escape_regex(char);
  }

  regex_body += '$';
  return new RegExp(regex_body);
}

/**
 * @param {string} value
 * @returns {string[]}
 */
function get_glob_match_candidates(value = '') {
  const normalized_value = normalize_codeblock_path(value);
  const source_path = normalized_value.split('#')[0] || '';
  const basename = normalized_value.split('/').pop() || normalized_value;
  const source_basename = source_path.split('/').pop() || source_path;

  return [...new Set([
    normalized_value,
    source_path,
    basename,
    source_basename,
  ].filter(Boolean))];
}

/**
 * @param {string} value
 * @param {string} pattern
 * @returns {boolean}
 */
function matches_basic_glob_pattern(value = '', pattern = '') {
  const regex = build_basic_glob_regex(pattern);
  if (!regex) return false;

  return get_glob_match_candidates(value)
    .some((candidate) => regex.test(candidate))
  ;
}

/**
 * @param {string} value
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function matches_codeblock_glob_patterns(value = '', patterns = []) {
  if (!Array.isArray(patterns) || !patterns.length) return false;

  return patterns.some((pattern) => {
    return matches_basic_glob_pattern(value, pattern);
  });
}

/**
 * Resolve an exact Smart Source key.
 *
 * @param {object} smart_sources
 * @param {string} source_path
 * @returns {string}
 */
export function resolve_internal_source_key(smart_sources, source_path = '') {
  const normalized_source_path = normalize_codeblock_path(source_path);
  if (!normalized_source_path) return '';

  const source = smart_sources?.get?.(normalized_source_path)
    || smart_sources?.items?.[normalized_source_path]
    || null
  ;

  return normalize_codeblock_path(source?.key || '');
}

/**
 * @param {string} source_key
 * @param {string} folder_path
 * @returns {boolean}
 */
export function is_source_key_in_folder(source_key = '', folder_path = '') {
  const normalized_source_key = normalize_codeblock_path(source_key);
  const normalized_folder_path = normalize_codeblock_path(folder_path);
  if (!normalized_source_key || !normalized_folder_path) return false;
  if (normalized_source_key === normalized_folder_path) return true;
  return normalized_source_key.startsWith(`${normalized_folder_path}/`)
    || normalized_source_key.startsWith(`${normalized_folder_path}#`)
  ;
}

/**
 * @param {string} source_key
 * @param {string[]} folder_paths
 * @returns {boolean}
 */
export function is_source_key_in_any_folder(source_key = '', folder_paths = []) {
  if (!Array.isArray(folder_paths) || !folder_paths.length) return false;

  return folder_paths.some((folder_path) => {
    return is_source_key_in_folder(source_key, folder_path);
  });
}

/**
 * @param {string} folder_path
 * @param {object} smart_sources
 * @returns {Array<{ key: string }>}
 */
export function get_internal_folder_sources(folder_path = '', smart_sources) {
  const normalized_folder_path = normalize_codeblock_path(folder_path);
  if (!normalized_folder_path || typeof smart_sources?.filter !== 'function') {
    return [];
  }

  const prefix = normalize_folder_prefix(normalized_folder_path);
  if (!prefix) return [];

  try {
    const matches = smart_sources.filter({ key_starts_with: prefix });
    if (!Array.isArray(matches)) return [];

    return matches.filter((source) => {
      return is_source_key_in_folder(source?.key || '', normalized_folder_path);
    });
  } catch (error) {
    console.warn('codeblock_folder_utils: failed to read internal folder sources', {
      folder_path: normalized_folder_path,
      error,
    });
    return [];
  }
}

/**
 * @param {string} folder_path
 * @param {object} smart_sources
 * @returns {boolean}
 */
export function is_internal_folder_path(folder_path = '', smart_sources) {
  const normalized_folder_path = normalize_codeblock_path(folder_path);
  if (!normalized_folder_path) return false;
  if (resolve_internal_source_key(smart_sources, normalized_folder_path)) return false;

  return get_internal_folder_sources(normalized_folder_path, smart_sources).length > 0;
}

/**
 * Expand an internal vault folder line into concrete Smart Context items.
 *
 * The returned items carry the originating folder path so
 * `build_codeblock_entries(...)` can re-collapse them back into one folder line.
 *
 * @param {string} folder_path
 * @param {object} smart_sources
 * @param {object} [params={}]
 * @param {Record<string, unknown>} [params.item_overrides]
 * @returns {Array<{ key: string, folder: string, ctx_codeblock: boolean }>}
 */
export function build_internal_folder_context_items(folder_path = '', smart_sources, params = {}) {
  const normalized_folder_path = normalize_codeblock_path(folder_path);
  if (!normalized_folder_path) return [];

  const item_overrides = params.item_overrides && typeof params.item_overrides === 'object'
    ? params.item_overrides
    : {}
  ;

  return get_internal_folder_sources(normalized_folder_path, smart_sources)
    .map((source) => {
      const source_key = normalize_codeblock_path(source?.key || '');
      if (!source_key) return null;

      return {
        key: source_key,
        folder: normalized_folder_path,
        ctx_codeblock: true,
        ...item_overrides,
      };
    })
    .filter(Boolean)
  ;
}

/**
 * @typedef {object} InternalCodeblockExclusions
 * @property {Set<string>} excluded_source_keys
 * @property {string[]} excluded_folder_paths
 * @property {string[]} excluded_glob_patterns
 * @property {Array<{ key: string, exclude: true, folder?: true, ctx_codeblock: boolean }>} excluded_items
 */

/**
 * Parse internal exclusion lines so folder lines can expand cleanly while still
 * preserving the compact exclusion line in the rewritten codeblock.
 *
 * Notes:
 * - `!../...` exclusions are intentionally skipped here because Pro handles
 *   those as external filesystem exclusions.
 * - Basic glob exclusions like `!*.test.js` are shared by internal folders and
 *   direct item includes.
 *
 * @param {string[]} context_lines
 * @param {object} smart_sources
 * @returns {InternalCodeblockExclusions}
 */
export function build_internal_codeblock_exclusions(context_lines = [], smart_sources) {
  const excluded_source_keys = new Set();
  const excluded_folder_paths = [];
  const excluded_glob_patterns = [];
  const excluded_items = [];

  const seen_folder_paths = new Set();
  const seen_glob_patterns = new Set();
  const seen_excluded_item_keys = new Set();

  /**
   * @param {object} item_data
   * @returns {void}
   */
  const add_excluded_item = (item_data = {}) => {
    const item_key = normalize_codeblock_path(item_data?.key || item_data?.path);
    if (!item_key || seen_excluded_item_keys.has(item_key)) return;

    seen_excluded_item_keys.add(item_key);
    excluded_items.push({
      ...item_data,
      key: item_key,
      exclude: true,
      ctx_codeblock: true,
    });
  };

  context_lines.forEach((line) => {
    const normalized_line = String(line ?? '').trim();
    if (!normalized_line.startsWith('!')) return;
    if (normalized_line.startsWith('!../')) return;

    const target = normalize_codeblock_path(normalized_line.slice(1));
    if (!target) return;

    if (is_basic_glob_pattern(target)) {
      if (!seen_glob_patterns.has(target)) {
        seen_glob_patterns.add(target);
        excluded_glob_patterns.push(target);
      }
      add_excluded_item({ key: target });
      return;
    }

    const source_key = resolve_internal_source_key(smart_sources, target);
    if (source_key) {
      excluded_source_keys.add(source_key);
      add_excluded_item({ key: source_key });
      return;
    }

    if (is_internal_folder_path(target, smart_sources)) {
      if (!seen_folder_paths.has(target)) {
        seen_folder_paths.add(target);
        excluded_folder_paths.push(target);
      }
      add_excluded_item({
        key: target,
        folder: true,
      });
      return;
    }

    add_excluded_item({ key: target });
  });

  return {
    excluded_source_keys,
    excluded_folder_paths,
    excluded_glob_patterns,
    excluded_items,
  };
}

/**
 * Determine whether an item should be excluded by codeblock exclusion rules.
 *
 * Exact source exclusions also exclude nested block references from that source.
 *
 * @param {string} item_key
 * @param {InternalCodeblockExclusions} exclusions
 * @returns {boolean}
 */
export function should_exclude_codeblock_item(item_key = '', exclusions = {}) {
  const normalized_item_key = normalize_codeblock_path(item_key);
  if (!normalized_item_key) return false;

  const excluded_source_keys = exclusions?.excluded_source_keys instanceof Set
    ? exclusions.excluded_source_keys
    : new Set()
  ;
  const excluded_folder_paths = Array.isArray(exclusions?.excluded_folder_paths)
    ? exclusions.excluded_folder_paths
    : []
  ;
  const excluded_glob_patterns = Array.isArray(exclusions?.excluded_glob_patterns)
    ? exclusions.excluded_glob_patterns
    : []
  ;

  for (const excluded_source_key of excluded_source_keys) {
    if (normalized_item_key === excluded_source_key) return true;
    if (normalized_item_key.startsWith(`${excluded_source_key}#`)) return true;
  }

  if (is_source_key_in_any_folder(normalized_item_key, excluded_folder_paths)) return true;
  if (matches_codeblock_glob_patterns(normalized_item_key, excluded_glob_patterns)) return true;

  return false;
}
