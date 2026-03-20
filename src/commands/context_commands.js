import { FolderSelectModal } from '../modals/folder_select_modal.js';
import { NamedContextSelectModal } from '../modals/named_context_select_modal.js';
import { StoryModal } from 'obsidian-smart-env/src/modals/story.js';
import { parse_codeblock_to_context_items } from '../utils/parse_codeblock_to_context_items.js';
import { default_context_codeblock_type } from '../utils/context_codeblock_constants.js';
import {
  build_copy_current_context,
  ensure_context_codeblock_in_editor,
  get_context_codeblock_ctx_key,
  get_or_create_codeblock_context_from_note,
  open_context_selector_for_codeblock,
  register_context_codeblock_sync_listener,
} from '../utils/context_codeblock_utils.js';

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

        register_context_codeblock_sync_listener(ctx, {
          plugin,
          source_path,
        });

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
      editorCheckCallback: (checking, editor, view) => {
        const source_path = view.file?.path;
        if (!source_path) return false;
        const source = plugin.env.smart_sources.get(source_path);
        if (!source) return false;
        const ModalClass = plugin.env.config.modals?.copy_context_modal?.class;
        if (!ModalClass) return false;
        if (checking) return true; // TODO: what checks should we do here?
        source.actions.source_get_context().then(async (ctx) => {
          if (!ctx) {
            plugin.env.events.emit('context:build_failed', {
              level: 'error',
              message: 'Failed to build context for current note.',
              event_source: 'context_commands.copy_current',
            });
            return;
          }

          const codeblock_ctx = await get_or_create_codeblock_context_from_note(plugin, source_path, {
            markdown: editor?.getValue?.(),
            parse_codeblock: (cb_content) => {
              return parse_codeblock_to_context_items(cb_content, {
                smart_contexts: plugin.env.smart_contexts,
              });
            },
          });
          const copy_ctx = build_copy_current_context(ctx, {
            codeblock_ctx,
            key: `${source_path}#copy_current`,
          }) || ctx;

          const modal = new ModalClass(copy_ctx);
          modal.open();
        });
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
