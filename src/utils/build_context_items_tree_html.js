import { build_context_item_li } from './build_context_item_li.js';

export function build_context_items_tree_html(items) {
  const tree_root = build_path_tree(items);
  const selected_set = new Set(items.map((it) => it.path));
  const tree_list_html = tree_to_html(tree_root, selected_set);
  return tree_list_html;
}

/**
 * build_path_tree
 * Convert an array of selected items into a nested directory tree while
 * removing redundant paths (i.e. children of a selected folder).
 *
 * In addition, recognise Obsidian block-key syntax ("##<blockKey>#{n}"). When
 * encountered the block key is treated as a final tree segment *after* the
 * file it belongs to. Any forward-slashes that appear inside the block key
 * must **not** be interpreted as path separators.
 *
 * @param {Array<{path:string}>} selected_items
 * @returns {Object} root tree node
 */
export function build_path_tree(selected_items = []) {
  /**
   * split_path_segments
   * Expand an item path into an ordered list of tree segments, correctly
   * handling embedded block-key syntax.
   *
   * Rules:
   *   • Keep the leading "##" on the block-key segment (e.g. "##baz / foo").
   *   • Keep the trailing "#{n}" block-ID segment (e.g. "#{1}").
   *   • Any forward-slash inside the block key is *data*, not a path break.
   *
   * @param {string} item_path
   * @returns {{ segments:string[], has_block:boolean }}
   */
  const split_path_segments = (item_path) => {

    // ── 1. Extract optional block-ID ( "#{n}" ) ────────────────────────────────
    const BLOCK_ID_RE = /#\{\d+\}$/u;
    let remainder = item_path;
    let block_id_seg = null;
    let block_key_seg = null;
    let has_block = false;

    const id_match = remainder.match(BLOCK_ID_RE);
    if (id_match) {
      block_id_seg = id_match[0];            // "#{n}"
      remainder = remainder.slice(0, -block_id_seg.length);
      has_block = true;
    }

    // ── 2. Extract optional block-key ( "##…" ) ───────────────────────────────
    const key_idx = remainder.indexOf("##");
    if (key_idx !== -1) {
      block_key_seg = remainder.slice(key_idx); // keep leading "##"
      remainder = remainder.slice(0, key_idx);
      has_block = true;
    }

    // ── 3. Split the remaining file/folder path on "/" ───────────────────────
    // Prevent splitting inside wikilinks [[...]]
    const segments = [];
    if (remainder) {
      let seg = '';
      let in_wikilink = false;
      for (let i = 0; i < remainder.length; i++) {
        if (!in_wikilink && remainder.slice(i, i + 2) === '[[') {
          in_wikilink = true;
          seg += '[[';
          i++;
        } else if (in_wikilink && remainder.slice(i, i + 2) === ']]') {
          in_wikilink = false;
          seg += ']]';
          i++;
        } else if (!in_wikilink && remainder[i] === '/') {
          segments.push(seg);
          seg = '';
        } else {
          seg += remainder[i];
        }
      }
      if (seg) segments.push(seg);
    }

    // ── 4. Append the block-specific segments (if present) ───────────────────
    if (block_key_seg) segments.push(block_key_seg);
    if (block_id_seg) segments.push(block_id_seg);

    return { segments, has_block };
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Build tree
  // ────────────────────────────────────────────────────────────────────────────
  const root = { name: '', children: {}, selected: false };

  // Helper – mark if a path is already covered by an ancestor folder
  const is_redundant = (p, selected_folders) =>
    selected_folders.some((folder) => p.startsWith(`${folder}/`));

  // Determine which user-selected items are folders so we can skip redundant children
  const selected_folders = selected_items
    .filter((it) => {
      const for_ext_check = it.path.includes('##')
        ? it.path.split('#')[0]
        : it.path;
      return !for_ext_check.match(/\.[a-zA-Z0-9]+$/u);
    })
    .map((it) => it.path);

  for (const { path } of selected_items) {
    if (is_redundant(path, selected_folders.filter((p) => p !== path))) continue;

    const { segments, has_block } = split_path_segments(path);

    let node = root;
    let running = '';

    segments.forEach((seg, idx) => {
      // Always update the running path, even if skipping as a child
      running = running ? `${running}/${seg}` : seg;

      // Skip adding "external:.." as a child node, but keep it in path properties
      if (seg.startsWith('external:..')) return;

      const is_last = idx === segments.length - 1;
      const is_block_leaf = is_last && has_block;

      if (!node.children[seg]) {
        node.children[seg] = {
          name: seg,
          path: is_block_leaf ? path : running,
          // For blocks we store an empty *array* so AVA can assert `children.length === 0`
          children: is_block_leaf ? [] : {},
          selected: false,
          is_file: is_block_leaf || (is_last && seg.includes('.')),
        };
      }

      node = node.children[seg];
      if (is_last) node.selected = true;
    });
  }

  return root;
}

/**
 * tree_to_html
 * Recursively convert a tree node into <ul>/<li> HTML.
 * Selected nodes receive a remove button.
 *
 * @param {Object} node
 * @param {Set<string>} selected_paths – quick lookup for removal buttons
 * @returns {string}
 */
export function tree_to_html(node, selected_paths) {
  if (!node.children || !Object.keys(node.children).length) return '';

  const child_html = Object.values(node.children)
    .sort((a, b) => {
      if (a.is_file !== b.is_file) return a.is_file ? 1 : -1;
      return a.name.localeCompare(b.name);
    })
    .map(child => build_context_item_li(child, selected_paths, tree_to_html(child, selected_paths)))
    .join('');

  return `<ul>${child_html}</ul>`;
}
