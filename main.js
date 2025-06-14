import {
  Plugin,
  Notice,
  TFolder,
  normalizePath,
} from 'obsidian';

import { SmartFs } from 'smart-file-system/smart_fs.js';
import { SmartFsObsidianAdapter } from 'smart-file-system/adapters/obsidian.js';

import { SmartEnv, merge_env_config } from 'obsidian-smart-env';

import { LinkDepthModal } from './src/views/link_depth_modal.js';

import { SmartContexts, SmartContext, smart_contexts } from 'smart-contexts';
// import { AjsonMultiFileCollectionDataAdapter } from 'smart-collections/adapters/ajson_multi_file.js';
import { SmartContextSettingTab } from './settings.js';

import { smart_env_config } from './smart_env.config.js';

import { FolderSelectModal } from "./src/views/folder_select_modal.js";

import { ContextSelectorModal } from './src/views/context_selector_modal.js';

import { copy_to_clipboard } from './src/utils/copy_to_clipboard.js';
import { show_stats_notice } from './src/utils/show_stats_notice.js';

import { get_all_open_file_paths } from './src/utils/get_all_open_file_paths.js';
import { get_visible_open_files } from './src/utils/get_visible_open_files.js';

export default class SmartContextPlugin extends Plugin {
  compiled_smart_env_config = smart_env_config;
  ContextSelectorModal = ContextSelectorModal;
  LinkDepthModal = LinkDepthModal;
  
  /**
   * Plugin-level config for hooking up "smart_env" modules.
   */
  smart_env_config = {
    collections: {
      smart_contexts,
    },
    item_types: {
      SmartContext,
    },
    modules: {
      smart_fs: {
        class: SmartFs,
        adapter: SmartFsObsidianAdapter,
      },
    },
  };

  onload() {
    console.log('onload', this.compiled_smart_env_config);
    // Initialize environment after Obsidian is fully ready
    SmartEnv.create(this, merge_env_config(this.compiled_smart_env_config, this.smart_env_config));
    // Initialize once the workspace (layout) is ready
    this.app.workspace.onLayoutReady(this.initialize.bind(this));
  }

  onunload() {
    // Release resources, no custom onUnload code needed if we register all events/commands.
    this.env.unload_main(this);
  }

  async initialize() {
    await SmartEnv.wait_for({ loaded: true });

    this.register_commands();
    this.register_context_selector_modal_command();

    // Right-click menu for folders
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle('Copy folder contents to clipboard')
              .setIcon('documents')
              .onClick(async () => {
                await this.copy_folder_to_clipboard(file);
              });
          });
        }
      })
    );

    // Settings tab
    this.addSettingTab(new SmartContextSettingTab(this.app, this));
  }

  /**
   * Helper to return a path relative to parent_path.
   */
  get_relative_path(child_path, parent_path) {
    if (child_path === parent_path) return '';
    if (!child_path.startsWith(parent_path)) {
      return child_path;
    }
    let rel = child_path.slice(parent_path.length);
    if (rel.startsWith('/')) rel = rel.slice(1);
    return rel;
  }

  register_context_selector_modal_command() {
    this.addCommand({
      id: "open-context-select-modal",
      name: "Context selector",
      callback: () => {
        // disabled automatically adding current file to context (may re-add in future with setting toggle)
        // const initial_context_items = [];
        // const active_file = this.app.workspace.getActiveFile();
        // if (active_file) initial_context_items.push(active_file.path);
        // this.open_context_selector_modal({ initial_context_items });
        this.open_context_selector_modal();
      },
    });
  }

  /**
   * Legacy commands
   */
  register_commands() {
    // Command: copy current note
    this.addCommand({
      id: 'copy-current-note-with-depth',
      name: 'Copy current note to clipboard',
      checkCallback: (checking) => {
        const base_items = [this.app.workspace.getActiveFile()];
        if (!base_items.length || !base_items[0]) return false;
        if (checking) return true;

        new this.LinkDepthModal(this, base_items).open();
        return true;
      },
    });
    // Command: copy visible open files
    this.addCommand({
      id: 'copy-visible-open-files',
      name: 'Copy visible open files (pick link depth)',
      checkCallback: (checking) => {
        const base_items = get_visible_open_files(this.app);
        console.log('copy-visible-open-files', base_items);
        if (!base_items.length) return false;
        if (checking) return true;

        new this.LinkDepthModal(this, base_items).open();
        return true;
      },
    });
    // Command: copy all open files
    this.addCommand({
      id: 'copy-all-open-files',
      name: 'Copy all open files (pick link depth)',
      checkCallback: (checking) => {
        const base_items = get_all_open_file_paths(this.app);
        console.log('copy-all-open-files', base_items);
        if (!base_items.length) return false;
        if (checking) return true;

        new this.LinkDepthModal(this, base_items).open();
        return true;
      },
    });
    // Command: select folder to copy contents
    this.addCommand({
      id: "select-folder-to-copy-contents",
      name: "Select folder to copy contents",
      callback: () => {
        new FolderSelectModal(this.app, async (folder) => {
          if (!folder) return;
          await this.copy_folder_to_clipboard(folder);
        }).open();
      },
    });
  }

  open_context_selector_modal(opts={}) {
    this.close_context_selector_modal();
    this.context_selector_modal = new this.ContextSelectorModal(this, opts);
    this.context_selector_modal.open(opts);
    return this.context_selector_modal;
  }
  close_context_selector_modal() {
    if (this.context_selector_modal) this.context_selector_modal.close(true);
    this.context_selector_modal = null;
  }

  /**
   * Copy folder contents at depth=0, including non-text files.
   */
  async copy_folder_to_clipboard(folder) {
    const add_items = this.env.smart_sources.filter({
      key_starts_with: folder.path,
    }).map(src => src.key);
    const ctx = this.env.smart_contexts.new_context({}, {
      add_items
    });

    const { context, stats, images } = await ctx.compile({ link_depth: 0 });
    await this.copy_to_clipboard(context, images);
    this.showStatsNotice(stats, `Folder: ${folder.path}`);
  }
  /**
   * Copy text to clipboard in a cross-platform manner.
   * On mobile, Node/Electron APIs are unavailable.
   */
  async copy_to_clipboard(text) {
    await copy_to_clipboard(text);
  }

  /**
   * Show user-facing notice summarizing stats.
   */
  showStatsNotice(stats, contextMsg) {
    show_stats_notice(stats, contextMsg);
  }
}
