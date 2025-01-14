/**
 * @file build_context.js
 * @description Builds a final context string and stats object from an in-memory set of items and optional links.
 * No longer strips excluded sections here — that logic now belongs in `respect_exclusions.js`.
 */

/**
 * @typedef {Object} BuildResultStats
 * @property {number} item_count - Number of items processed
 * @property {number} link_count - Number of links processed
 * @property {number} char_count - Character count of the final 'context' string
 */

/**
 * @typedef {Object} BuildResult
 * @property {string} context - The final context string
 * @property {BuildResultStats} stats - Stats about merges, etc.
 */

/**
 * @typedef {Object} BuildContextOptions
 * @property {Record<string, string>} [items] - Main items (filename/path -> content)
 * @property {Record<string, [string, string]>} [links] - Item links:
 *   Format: {
 *     [sourceKey]: [linkedKey, linkContent]
 *   }
 * @property {string} [before_context] - Inserted at the beginning
 * @property {string} [after_context] - Inserted at the end
 * @property {string} [before_item] - Inserted before each item
 * @property {string} [after_item] - Inserted after each item
 * @property {string} [before_link] - Inserted before each link
 * @property {string} [after_link] - Inserted after each link
 * @property {boolean} [inlinks] - If true, link placeholders use "IN-LINK" as LINK_TYPE, else "OUT-LINK"
 */

/**
 * build_context()
 * Builds the final output from compiled items and optional links, applying
 * before/after placeholders around context, items, and links, and optionally injecting a file tree.
 * 
 * NOTE: Exclusion of headings is handled externally (via `respect_exclusions.js`).
 * This function assumes items/links have already been processed if any exclusions are needed.
 *
 * @async
 * @param {BuildContextOptions} opts
 * @returns {Promise<BuildResult>}
 */
export async function build_context(opts = {}) {
  const {
    items = {},
    links = {},
    before_context = '',
    after_context = '',
    before_item = '',
    after_item = '',
    before_link = '',
    after_link = '',
    inlinks = false,
  } = opts;

  // Optionally build a naive file tree to inject if {{FILE_TREE}} is used
  const file_tree_string = create_file_tree_string(Object.keys(items), Object.keys(links));

  let content_accumulator = '';
  const stats = {
    item_count: 0,
    link_count: 0,
    char_count: 0,
  };

  // If there's a top-level prefix
  if (before_context) {
    content_accumulator += replace_file_tree_placeholder(before_context, file_tree_string) + '\n';
  }

  // Process items (primary)
  for (const [item_path, item_content] of Object.entries(items)) {
    stats.item_count++;

    // Insert <before_item>
    if (before_item) {
      content_accumulator += replace_item_placeholders(before_item, item_path) + '\n';
    }

    // Append the item content (no heading-exclusion here)
    content_accumulator += item_content.trim() + '\n';

    // Insert <after_item>
    if (after_item) {
      content_accumulator += replace_item_placeholders(after_item, item_path) + '\n';
    }
  }

  // Process links (secondary)
  for (const [link_key, linkData] of Object.entries(links)) {
    if (!linkData) continue;
    stats.link_count++;

    const {to, from, content, type, depth} = linkData;

    let item_key;
    if(to?.[0]) item_key = to[0];
    else if(from?.[0]) item_key = from[0];

    const var_replacements = {
      LINK_PATH: link_key,
      LINK_NAME: link_key.substring(link_key.lastIndexOf('/') + 1),
      LINK_ITEM_PATH: item_key,
      LINK_ITEM_NAME: item_key.substring(item_key.lastIndexOf('/') + 1),
      LINK_TYPE: type?.[0],
      LINK_DEPTH: depth?.[0],
    };
    // Insert <before_link>
    if (before_link) {
      content_accumulator += replace_link_placeholders(before_link, var_replacements) + '\n';
    }

    // Append link content
    content_accumulator += content.trim() + '\n';

    // Insert <after_link>
    if (after_link) {
      content_accumulator += replace_link_placeholders(after_link, var_replacements) + '\n';
    }
  }

  // If there's a bottom-level suffix
  if (after_context) {
    content_accumulator += replace_file_tree_placeholder(after_context, file_tree_string) + '\n';
  }

  const final_str = content_accumulator.trim();
  stats.char_count = final_str.length;

  return {
    context: final_str,
    stats,
  };
}

/**
 * Utility to create a rudimentary file tree string from item paths and link paths if needed.
 * @param {string[]} itemPaths
 * @param {string[]} linkPaths
 * @returns {string}
 */
function create_file_tree_string(itemPaths, linkPaths) {
  const allPaths = new Set([...itemPaths, ...linkPaths]);
  const sorted = Array.from(allPaths).sort();
  const treeLines = [];
  sorted.forEach(path => {
    const parts = path.split('/');
    let prefix = '';
    for (let i = 0; i < parts.length - 1; i++) {
      prefix += '  ';
    }
    treeLines.push(prefix + parts[parts.length - 1]);
  });
  return treeLines.join('\n');
}

/**
 * Replaces the {{FILE_TREE}} placeholder in a template with the provided file_tree_string.
 * @param {string} template
 * @param {string} file_tree_string
 * @returns {string}
 */
function replace_file_tree_placeholder(template, file_tree_string) {
  return template.replace(/\{\{FILE_TREE\}\}/g, file_tree_string || '');
}

/**
 * Replaces item placeholders in a template:
 * - {{ITEM_PATH}} -> the item path
 * - {{ITEM_NAME}} -> the item name
 * @param {string} template
 * @param {string} itemPath
 * @returns {string}
 */
function replace_item_placeholders(template, itemPath) {
  const itemName = itemPath.substring(itemPath.lastIndexOf('/') + 1);
  return template
    .replace(/\{\{ITEM_PATH\}\}/g, itemPath)
    .replace(/\{\{ITEM_NAME\}\}/g, itemName);
}

/**
 * Replaces link placeholders in a template:
 * - {{LINK_PATH}}, {{LINK_NAME}}, {{LINK_ITEM_PATH}}, {{LINK_ITEM_NAME}}, {{LINK_TYPE}}
 * @param {string} template
 * @param {Object} linkObj
 * @returns {string}
 */
function replace_link_placeholders(template, linkObj) {
  let replaced = template;
  replaced = replaced.replace(/\{\{LINK_PATH\}\}/g, linkObj.LINK_PATH);
  replaced = replaced.replace(/\{\{LINK_NAME\}\}/g, linkObj.LINK_NAME);
  replaced = replaced.replace(/\{\{LINK_ITEM_PATH\}\}/g, linkObj.LINK_ITEM_PATH);
  replaced = replaced.replace(/\{\{LINK_ITEM_NAME\}\}/g, linkObj.LINK_ITEM_NAME);
  replaced = replaced.replace(/\{\{LINK_TYPE\}\}/g, linkObj.LINK_TYPE);
  return replaced;
}
