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

