export function build_context_items_tree_html(items) {
  const tree_root = build_path_tree(items);
  const selected_set = new Set(items.map(it => it.path));
  const tree_list_html = tree_to_html(tree_root, selected_set);
  return tree_list_html;
}

/**
 * build_path_tree
 * Convert an array of selected items into a nested directory tree while
 * removing redundant paths (i.e. children of a selected folder).
 *
 * @param {Array<{path:string}>} selected_items
 * @returns {Object} root tree node
 */
export function build_path_tree (selected_items = []) {
  const root = { name: '', children: {}, selected: false };
  // Helper – mark if a path is already covered by an ancestor folder
  const is_redundant = (path, selected_folders) => {
    return selected_folders.some(folder => path.startsWith(folder + '/')); 
  };
  const selected_folders = selected_items
    .filter(it => !it.path.match(/\.[a-zA-Z0-9]+$/)) // heuristic: no extension ⇒ folder
    .map(it => it.path)
  ;

  for (const { path } of selected_items) {
    if (is_redundant(path, selected_folders.filter(p => p !== path))) continue;
    const segments = path.split('/');
    let node = root;
    let running = '';
    segments.forEach((seg, idx) => {
      running = running ? `${running}/${seg}` : seg;
      if (!node.children[seg]) {
        node.children[seg] = {
          name: seg,
          path: running,
          children: {},
          selected: false,
          is_file: idx === segments.length - 1 && seg.includes('.')
        };
      }
      node = node.children[seg];
      if (idx === segments.length - 1) node.selected = true;
    });
  }
  return root;
}

/**
 * tree_to_html
 * Recursively convert a tree node into <ul>/<li> HTML.
 * Selected nodes receive a remove button.
 * @param {Object} node
 * @param {Set<string>} selected_paths – quick lookup for removal buttons
 * @returns {string}
 */
export function tree_to_html (node, selected_paths) {
  if (!node.children || !Object.keys(node.children).length) return '';

  const child_html = Object.values(node.children)
    .sort((a, b) => {
      if (a.is_file !== b.is_file) return a.is_file ? 1 : -1;
      return a.name.localeCompare(b.name);
    })
    .map(child => {
      let remove_btn = '';
      let connections_btn = '';
      let links_btn = '';
      if(selected_paths.has(child.path)){
        remove_btn = `<span class="sc-tree-remove" data-path="${child.path}">×</span>`;
        connections_btn = `<span class="sc-tree-connections" data-path="${child.path}">connections</span>`;
        links_btn = `<span class="sc-tree-links" data-path="${child.path}">links</span>`;
      }
      const li_inner = `
        ${remove_btn}
        <span class="sc-tree-label">${child.name}</span>
        ${connections_btn}
        ${links_btn}
        ${tree_to_html(child, selected_paths)}
      `;
      return `<li data-path="${child.path}" class="sc-tree-item ${child.is_file ? 'file' : 'dir'}">${li_inner}</li>`;
    })
    .join('');
  return `<ul>${child_html}</ul>`;
}