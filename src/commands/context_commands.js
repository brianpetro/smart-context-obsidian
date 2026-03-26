import { FolderSelectModal } from '../modals/folder_select_modal.js';
import { NamedContextSelectModal } from '../modals/named_context_select_modal.js';
import { StoryModal } from 'obsidian-smart-env/src/modals/story.js';
import { MarkdownView } from 'obsidian';
import { default_context_codeblock_type } from '../utils/context_codeblock_constants.js';
import {
  ensure_context_codeblock_in_editor,
  get_context_codeblock_ctx_key,
  open_context_selector_for_codeblock,
} from '../utils/context_codeblock_utils.js';
import {
  copy_current_as_link_tree,
  copy_current_to_clipboard,
  get_copy_current_dependencies,
  open_copy_current_modal,
  resolve_active_source_path,
} from '../utils/commands_helpers.js';

const CORE_COPY_CURRENT_FILE_TYPES = ['md', 'canvas', 'excalidraw.md'];

/**
 * Build the shared current-note copy params used by modal and fixed-depth
 * command paths.
 *
 * @param {object} plugin
 * @param {object} params
 * @param {string[]} [params.allowed_file_types] - Optional list of allowed file types to copy (e.g. ['md', 'canvas'])
 * @returns {object|null}
 */
export function get_current_copy_params(plugin, params = {}) {
  const active_view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  const active_file = plugin.app.workspace.getActiveFile?.();
  const source_path = resolve_active_source_path({
    view: active_view,
    active_file,
  });
  const copy_deps = get_copy_current_dependencies(plugin.env, {
    source_path,
    allowed_file_types: params.allowed_file_types || CORE_COPY_CURRENT_FILE_TYPES,
  });
  if (!copy_deps) return null;

  return {
    ...copy_deps,
    markdown: active_view?.file?.path === source_path
      ? active_view?.editor?.getValue?.()
      : undefined,
  };
}

/**
 * Build a direct fixed-depth current-note copy command.
 *
 * @param {object} plugin
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.name
 * @param {number} params.max_depth
 * @param {boolean} [params.include_inlinks=false]
 * @param {string[]} [params.allowed_file_types] - Passed to get_current_copy_params.
 * @returns {object}
 */
export function build_direct_copy_command(plugin, params = {}) {
  return {
    id: params.id,
    name: params.name,
    checkCallback: (checking) => {
      const copy_params = get_current_copy_params(plugin, {
        allowed_file_types: params.allowed_file_types,
      });
      if (!copy_params) return false;
      if (checking) return true;

      void copy_current_to_clipboard(plugin, {
        ...copy_params,
        max_depth: params.max_depth,
        include_inlinks: params.include_inlinks === true,
      });
      return true;
    },
  };
}

export function context_commands(plugin) {
  return {
    new_context: {
      id: 'new-context-open-selector',
      name: 'Open Selector for New Context',
      checkCallback: (checking) => {
        if (!plugin?.env?.smart_contexts) return false;
        if (checking) return true;
        plugin.open_new_context_modal();
        return true;
      },
    },
    insert_codeblock: {
      id: 'external-file-codeblock',
      name: 'Insert codeblock (add notes & named contexts)',
      editorCheckCallback: (checking, editor, view) => {
        const source_path = view?.file?.path;
        if (!source_path) return false;
        if (!plugin?.env?.smart_contexts) return false;
        if (checking) return true;

        ensure_context_codeblock_in_editor(editor, {
          codeblock_type: default_context_codeblock_type,
        });

        const ctx_key = get_context_codeblock_ctx_key(source_path);
        const smart_contexts = plugin.env.smart_contexts;
        const ctx = smart_contexts.get(ctx_key) || smart_contexts.new_context({ key: ctx_key });
        ctx.data.codeblock_type = default_context_codeblock_type;

        open_context_selector_for_codeblock(ctx);
        return true;
      },
    },
    copy_named_context: {
      id: 'copy-named-context-with-depth',
      name: 'Copy named context to clipboard (choose depth)',
      checkCallback: (checking) => {
        if (!plugin?.env?.smart_contexts) return false;
        if (checking) return true;
        const modal = new NamedContextSelectModal(plugin.app, plugin, {
          max_depth: 3,
        });
        modal.open();
        return true;
      },
    },
    get_started: {
      id: 'show-getting-started',
      name: 'Help: Show getting started',
      callback: () => {
        StoryModal.open(plugin, {
          title: 'Getting Started With Smart Context',
          url: 'https://smartconnections.app/story/smart-context-getting-started/?utm_source=sc-command',
        });
      },
    },
    copy_current: {
      id: 'copy-current-note-with-depth',
      name: 'Copy current to clipboard (choose link depth)',
      checkCallback: (checking) => {
        const copy_params = get_current_copy_params(plugin);
        if (!copy_params) return false;
        if (checking) return true;

        void open_copy_current_modal(plugin, copy_params);
        return true;
      },
    },
    copy_current_depth_0: build_direct_copy_command(plugin, {
      id: 'copy-current-note-depth-0',
      name: 'Copy current to clipboard (depth 0)',
      max_depth: 0,
    }),
    copy_current_depth_1: build_direct_copy_command(plugin, {
      id: 'copy-current-note-depth-1',
      name: 'Copy current to clipboard (depth 1)',
      max_depth: 1,
    }),
    copy_current_depth_1_with_backlinks: build_direct_copy_command(plugin, {
      id: 'copy-current-note-depth-1-with-backlinks',
      name: 'Copy current to clipboard (depth 1, include backlinks)',
      max_depth: 1,
      include_inlinks: true,
    }),
    copy_current_link_tree: {
      id: 'copy-current-note-link-tree',
      name: 'Copy current as link tree',
      checkCallback: (checking) => {
        const copy_params = get_current_copy_params(plugin);
        if (!copy_params) return false;
        if (checking) return true;

        void copy_current_as_link_tree(plugin, copy_params);
        return true;
      },
    },
    copy_folder: {
      id: 'copy-folder-to-clipboard',
      name: 'Copy entire folder to clipboard',
      callback: () => {
        new FolderSelectModal(plugin.app, async (folder) => {
          if (!folder) return;
          await plugin.copy_folder_to_clipboard(folder);
        }).open();
      },
    },
  };
}
