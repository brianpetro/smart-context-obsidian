import {
  has_smart_drag_data,
  read_smart_drag_data,
} from 'obsidian-smart-env/src/utils/smart_drag_drop.js';
import {
  classify_dropped_obsidian_entry,
  get_dropped_obsidian_entry_path,
  parse_dropped_obsidian_entries,
} from 'obsidian-smart-env/src/utils/parse_dropped_obsidian_data.js';
import { expand_folders_to_item_keys } from './folder_selection.js';
import { get_selected_context_item_keys } from './get_selected_context_item_keys.js';

const SMART_CONTEXT_COLLECTION_KEYS = new Set([
  'smart_sources',
  'smart_blocks',
]);

function get_file_extension(file_path) {
  const file_name = String(file_path || '').split('/').pop() || '';
  const extension_i = file_name.lastIndexOf('.');
  return extension_i === -1 ? '' : file_name.slice(extension_i + 1).toLowerCase();
}

function get_smart_item_keys(env, data_transfer) {
  const smart_drag_data = read_smart_drag_data(data_transfer);
  if (!smart_drag_data) return [];

  const item_keys = [];

  for (const { collection_key, item_key } of smart_drag_data.items) {
    if (!SMART_CONTEXT_COLLECTION_KEYS.has(collection_key)) return [];

    const key = env?.[collection_key]?.get?.(item_key)?.key;
    if (!key) return [];

    item_keys.push(key);
  }

  return item_keys;
}

function get_native_item_keys(env, data_transfer) {
  const smart_sources = env?.smart_sources;
  const smart_fs = smart_sources?.fs || env?.fs;
  const file_paths = Array.from(new Set([
    ...(smart_fs?.file_paths || []),
    ...Object.keys(smart_sources?.items || {}),
  ]));
  const folder_paths = smart_fs?.folder_paths || [];
  const vault_path = smart_fs?.base_path || '';
  const item_keys = [];

  for (const entry of parse_dropped_obsidian_entries(data_transfer)) {
    const entry_path = get_dropped_obsidian_entry_path(entry, vault_path);
    const block = env?.smart_blocks?.get?.(entry_path);
    if (block?.key) {
      item_keys.push(block.key);
      continue;
    }

    const classified_entry = classify_dropped_obsidian_entry(entry, {
      file_paths,
      folder_paths,
      vault_path,
    });
    if (
      classified_entry.status !== 'exact'
      && classified_entry.status !== 'recovered'
    ) {
      continue;
    }

    if (classified_entry.kind === 'file') {
      const source = env?.smart_sources?.get?.(classified_entry.path);
      if (source?.key) {
        item_keys.push(source.key);
        continue;
      }

      item_keys.push(...get_selected_context_item_keys([
        {
          path: classified_entry.path,
          extension: get_file_extension(classified_entry.path),
        },
      ], smart_sources));
      continue;
    }

    if (classified_entry.kind === 'folder') {
      item_keys.push(...expand_folders_to_item_keys(
        [classified_entry.path],
        smart_sources,
      ));
    }
  }

  return item_keys;
}

/**
 * Resolve one dropped batch into Smart Context item keys.
 *
 * Smart Source and Smart Block identity is authoritative when the Smart MIME
 * type is present. Native File Navigator data is used only when it is absent.
 *
 * @param {object} env
 * @param {DataTransfer|object} data_transfer
 * @returns {string[]}
 */
export function resolve_dropped_context_item_keys(env, data_transfer) {
  const item_keys = has_smart_drag_data(data_transfer)
    ? get_smart_item_keys(env, data_transfer)
    : get_native_item_keys(env, data_transfer)
  ;

  return Array.from(new Set(item_keys.filter(Boolean)));
}
