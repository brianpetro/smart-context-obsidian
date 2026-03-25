/**
 * @file pure_utils.js
 * @description No dependencies here.
 */


/**
 * @param {string} value
 * @returns {string}
 */
export function normalize_string(value = '') {
  return String(value ?? '').trim();
}

/**
 * @param {string} contents
 * @returns {string}
 */
export function normalize_codeblock_contents(contents = '') {
  const normalized_contents = String(contents ?? '').replace(/\r\n/g, '\n');
  return normalized_contents.endsWith('\n')
    ? normalized_contents
    : `${normalized_contents}\n`;
}

/**
 * @param {string} value
 * @returns {string}
 */
export function escape_regex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function is_codeblock_context_key(key = '') {
  return typeof key === 'string' && key.endsWith('#codeblock');
}

function normalize_path(_path) {
  return _path.replace(/\\/g, "/");
}

export function get_abs_path(vault_path, relative_path) {
  vault_path = normalize_path(vault_path);
  relative_path = normalize_path(relative_path);
  // handle ../ in paths by resolving against vault path
  const vault_pcs = vault_path.split("/");
  const relative_pcs = relative_path.split("/");

  const resolved_pcs = [];
  for (const pc of relative_pcs) {
    if (pc === "..") {
      vault_pcs.pop();
    } else {
      resolved_pcs.push(pc);
    }
  }

  return [...vault_pcs, ...resolved_pcs].join("/");

}

/**
 * @param {string} _path
 * @returns {string}
 */
export function get_basename(_path = '') {
  const normalized_path = String(_path || '').trim().replace(/\\+/g, '/');
  if (!normalized_path) return _path;

  const file_name = normalized_path.split('/').pop() || '';
  return file_name.replace(/\.[^.]+$/u, '');
}

/**
 * @param {Date|number|string} value
 * @returns {string}
 */
export function format_ymd(value) {
  const date = value instanceof Date
    ? value
    : new Date(value || Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
