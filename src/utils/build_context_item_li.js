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
  let { key, path, name, is_file } = item;
  const has_children = child_html.trim() !== '';
  let remove_btn = '';
  let connections_btn = '';
  let links_btn = '';

  if(!key) key = path; // DEPRECATED, use key
  if (
    selected_paths.has(key)
    || has_children
  ) {
    remove_btn = `<span class="sc-tree-remove" data-path="${key}">×</span>`;
  }
  if (
    selected_paths.has(key)
    && !key.startsWith('external:../')
  ) {
    connections_btn = `<span class="sc-tree-connections" data-path="${key}" title="Connections for ${name}"></span>`;
    links_btn = `<span class="sc-tree-links" data-path="${key}" title="Links for ${name}"></span>`;
  }
  const label_classes = ['sc-tree-label'];
  if (item.exists === false) label_classes.push('missing');

  return `<li data-path="${key}" class="sc-tree-item ${is_file ? 'file' : 'dir'}${key.startsWith('external:') ? ' sc-external' : ''}">
    ${remove_btn}
    <span class="${label_classes.join(' ')}">${name}</span>
    ${connections_btn}
    ${links_btn}
    ${child_html}
  </li>`;
}
