import { FolderSelectModal } from '../modals/folder_select_modal.js';
import { StoryModal } from 'obsidian-smart-env/src/modals/story.js';  // ← NEW

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
      name: 'Copy current to clipboard',
      editorCheckCallback: (checking, editor, view) => {
        const source_path = view.file?.path;
        if(!source_path) return false;
        const source = plugin.env.smart_sources.get(source_path);
        if(!source) return false;
        const ModalClass = plugin.env.config.modals?.copy_context_modal?.class;
        if (!ModalClass) return false;
        if(checking) return true; // TODO: what checks should we do here?
        source.actions.source_get_context().then((ctx) => {
          if(!ctx) {
            plugin.env.events.emit('notification:error', {
              message: 'Failed to build context for current note.',
            });
            new Notice('Failed to build context for current note.');
            return;
          }
          const modal = new ModalClass(ctx);
          modal.open();
        });
        return true;
      }
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
    }
  }

}