import { build_file_tree_string } from 'smart-utils/file_tree.js';

export function replace_folder_tree_var(prompt) {
  let paths = smart_env.smart_sources?.fs?.folder_paths ?? [];
  paths = paths.map(p => p.endsWith('/') ? p : p + '/'); // Ensure all paths end with a slash
  const tree = build_file_tree_string([...new Set(paths)]);
  prompt = prompt.replace(/{{\s*folder_tree\s*}}/gi, tree);
  return prompt;
}
