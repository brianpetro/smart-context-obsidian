/**
 * build_context_item_li
 *
 * @param {Object} item
 * @param {string} item.path
 * @param {string} item.name
 * @param {boolean} item.is_file
 * @param {Set<string>} selected_paths
 * @param {string} [child_html='']
 * @returns {string}
 */
export function build_context_item_li(item, selected_paths, child_html = '') {
  const { path, name, is_file } = item;
  const has_children = child_html.trim() !== '';
  let remove_btn = '';
  let connections_btn = '';
  let links_btn = '';

  if (selected_paths.has(path) || has_children) {
    remove_btn = `<span class="sc-tree-remove" data-path="${path}">×</span>`;
  }
  if (selected_paths.has(path) && !path.startsWith('external:../')) {
    connections_btn = `<span class="sc-tree-connections" data-path="${path}" title="Connections for ${name}"></span>`;
    links_btn = `<span class="sc-tree-links" data-path="${path}" title="Links for ${name}"></span>`;
  }

  return `<li data-path="${path}" class="sc-tree-item ${is_file ? 'file' : 'dir'}${path.startsWith('external:') ? ' sc-external' : ''}">
    ${remove_btn}
    <span class="sc-tree-label">${name}</span>
    ${connections_btn}
    ${links_btn}
    ${child_html}
  </li>`;
}
