import { MarkdownView } from 'obsidian';
import {
  copy_current_as_link_tree,
  copy_current_to_clipboard,
  is_copy_current_supported_source,
  open_copy_current_modal,
  resolve_active_source_path,
} from '../../utils/commands_helpers.js';

export const CORE_COPY_CURRENT_FILE_TYPES = [
  'md',
  'canvas',
  'excalidraw.md',
];

/**
 * Resolve current-source placement params from the active Obsidian view.
 *
 * @param {object} placement_ctx
 * @param {object} [params={}]
 * @returns {object}
 */
export function get_copy_current_placement_params(
  placement_ctx,
  params = {},
) {
  const { plugin } = placement_ctx;
  const active_view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  const active_file = plugin.app.workspace.getActiveFile?.();
  const source_path = resolve_active_source_path({
    view: active_view,
    active_file,
  });

  return {
    plugin,
    source_path: source_path || '',
    allowed_file_types:
      params.allowed_file_types
      || CORE_COPY_CURRENT_FILE_TYPES,
    mode: params.mode || 'modal',
    max_depth: params.max_depth,
    ...(typeof params.include_inlinks === 'undefined'
      ? {}
      : { include_inlinks: params.include_inlinks === true }),
    with_media: params.with_media === true,
    markdown: active_view?.file?.path === source_path
      ? active_view?.editor?.getValue?.()
      : undefined,
  };
}

/**
 * Copy or open the current source context using the requested command mode.
 *
 * @this {import('smart-sources').SmartSource}
 * @param {object} [params={}]
 * @returns {Promise<boolean|null>}
 */
export async function source_copy_current(params = {}) {
  const {
    plugin,
    source_path,
    mode,
  } = params;
  if (!plugin || !source_path) return false;

  const copy_params = {
    ...params,
    source: this,
    modal_class:
      this.env.config?.modals?.copy_context_modal?.class,
  };

  if (mode === 'direct') {
    return await copy_current_to_clipboard(
      plugin,
      copy_params,
    );
  }

  if (mode === 'link_tree') {
    return await copy_current_as_link_tree(
      plugin,
      copy_params,
    );
  }

  return await open_copy_current_modal(
    plugin,
    copy_params,
  );
}

function register_when({ plugin }) {
  return plugin.manifest.id === 'smart-context';
}

function get_scope({ env, params }) {
  return params.source_path
    ? env.smart_sources?.get?.(params.source_path)
    : null
  ;
}

function when({ env, params, scope }) {
  if (!scope) return false;
  if (!is_copy_current_supported_source(scope, {
    allowed_file_types: params.allowed_file_types,
  })) {
    return false;
  }

  return Boolean(
    env.config?.modals?.copy_context_modal?.class,
  );
}

export const commands = {
  'copy-current-note-with-depth': {
    name: 'Copy current text to clipboard (choose link depth)',
    register_when,

    params(command_ctx) {
      return get_copy_current_placement_params(command_ctx);
    },

    get_scope,
    when,
  },

  'copy-current-note-depth-0': {
    name: 'Copy current text to clipboard (depth 0)',
    register_when,

    params(command_ctx) {
      return get_copy_current_placement_params(command_ctx, {
        mode: 'direct',
        max_depth: 0,
        include_inlinks: false,
      });
    },

    get_scope,
    when,
  },

  'copy-current-note-depth-1': {
    name: 'Copy current text to clipboard (depth 1)',
    register_when,

    params(command_ctx) {
      return get_copy_current_placement_params(command_ctx, {
        mode: 'direct',
        max_depth: 1,
        include_inlinks: false,
      });
    },

    get_scope,
    when,
  },

  'copy-current-note-depth-1-with-backlinks': {
    name: 'Copy current text to clipboard (depth 1, include backlinks)',
    register_when,

    params(command_ctx) {
      return get_copy_current_placement_params(command_ctx, {
        mode: 'direct',
        max_depth: 1,
        include_inlinks: true,
      });
    },

    get_scope,
    when,
  },

  'copy-current-note-link-tree': {
    name: 'Copy current as link tree',
    register_when,

    params(command_ctx) {
      return get_copy_current_placement_params(command_ctx, {
        mode: 'link_tree',
      });
    },

    get_scope,
    when,
  },
};

export const ribbon_icons = {
  copy_context: {
    icon_name: 'smart-copy-note',
    description: 'Smart Context: Copy current (select depth)',
    register_when,

    params(ribbon_ctx) {
      return get_copy_current_placement_params(ribbon_ctx);
    },

    get_scope,
    when,
  },
};
