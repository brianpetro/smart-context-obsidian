import {
  has_smart_drag_data,
  read_smart_drag_data,
} from 'obsidian-smart-env/src/utils/smart_drag_drop.js';
import { parse_dropped_obsidian_data } from 'obsidian-smart-env/src/utils/parse_dropped_obsidian_data.js';
import { expand_folders_to_item_keys } from './folder_selection.js';
import { get_selected_context_item_keys } from './get_selected_context_item_keys.js';

const SMART_CONTEXT_COLLECTION_KEYS = new Set([
  'smart_sources',
  'smart_blocks',
]);

function normalize_path(value) {
  return String(value || '')
    .trim()
    .replace(/\\+/g, '/')
    .replace(/\/+$/g, '')
  ;
}

/**
 * Resolve an exact or uniquely matching vault-relative path.
 * @param {string[]} known_paths
 * @param {string} dropped_path
 * @param {boolean} [allow_appended_md=false]
 * @returns {string}
 */
function resolve_known_path(known_paths, dropped_path, allow_appended_md = false) {
  const normalized_drop = normalize_path(dropped_path);
  if (!normalized_drop) return '';

  const paths = known_paths.map(normalize_path).filter(Boolean);
  const exact_path = paths.find((path) => path === normalized_drop);
  if (exact_path) return exact_path;

  const matches = paths.filter((path) => {
    const candidates = allow_appended_md ? [path, `${path}.md`] : [path];
    return candidates.some((candidate) => {
      return normalized_drop.endsWith(`/${candidate}`)
        || candidate.endsWith(`/${normalized_drop}`)
      ;
    });
  });

  return matches.length === 1 ? matches[0] : '';
}

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
  const file_paths = smart_sources?.fs?.file_paths || env?.fs?.file_paths || [];
  const folder_paths = smart_sources?.fs?.folder_paths || [];
  const item_keys = [];

  for (const dropped_path of parse_dropped_obsidian_data(data_transfer)) {
    const block = env.smart_blocks?.get?.(dropped_path);
    const source = env.smart_sources?.get?.(dropped_path);
    if (block?.key || source?.key) {
      item_keys.push(block?.key || source.key);
      continue;
    }

    const file_path = resolve_known_path(file_paths, dropped_path);
    if (file_path) {
      item_keys.push(...get_selected_context_item_keys([
        {
          path: file_path,
          extension: get_file_extension(file_path),
        },
      ], smart_sources));
      continue;
    }

    const folder_path = resolve_known_path(folder_paths, dropped_path, true);
    if (folder_path) {
      item_keys.push(...expand_folders_to_item_keys([folder_path], smart_sources));
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
