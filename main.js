import {
  Plugin,
  Notice,
  TFolder,
} from 'obsidian';

import { SmartEnv, merge_env_config } from 'obsidian-smart-env';

import { LinkDepthModal } from './src/views/link_depth_modal.js';

import { SmartContexts, SmartContext, smart_contexts } from 'smart-contexts';
import { SmartContextSettingTab } from './settings.js';

import { smart_env_config } from './smart_env.config.js';

import { FolderSelectModal } from './src/views/folder_select_modal.js';

import { copy_to_clipboard } from 'obsidian-smart-env/utils/copy_to_clipboard.js';
import { show_stats_notice } from './src/utils/show_stats_notice.js';

import { get_all_open_file_paths } from './src/utils/workspace.js';
import { get_visible_open_files } from './src/utils/workspace.js';

import { get_selected_note_keys } from './src/utils/get_selected_note_keys.js';

import { StoryModal } from 'obsidian-smart-env/modals/story.js';  // ← NEW

// v2
import { ContextsDashboardView } from './src/views/contexts_dashboard_view.js';
import { CopyContextModal } from './src/modals/copy_context_modal.js';

/**
 * Smart Context (Obsidian) – copy & curate context for AI tools.
 *
 * @extends Plugin
 */
export default class SmartContextPlugin extends Plugin {
  /* ------------------------------------------------------------------ */
  /*  Smart‑Env registration                                             */
  /* ------------------------------------------------------------------ */
  compiled_smart_env_config = smart_env_config;
  LinkDepthModal = LinkDepthModal;

  smart_env_config = {
    collections: {
      smart_contexts,
    },
    item_types: {
      SmartContext,
    },
    modals: {
      copy_context_modal: {
        class: CopyContextModal,
      },
    },
  };

  /* ------------------------------------------------------------------ */
  /*  Lifecycle                                                         */
  /* ------------------------------------------------------------------ */
  onload() {
    this.app.workspace.onLayoutReady(this.initialize.bind(this));
    SmartEnv.create(this, merge_env_config(
      this.compiled_smart_env_config,
      this.smart_env_config,
    ));
  }

  onunload() {
    try { this.unregister_event_bus_handlers(); } catch (e) { /* no-op */ }
    this.env.unload_main(this);
  }

  /**
   * Top‑level bootstrap after Obsidian workspace is ready.
   * Handles first‑run onboarding, command registration, menus, etc.
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.load_new_user_state();                 // ← NEW
    await SmartEnv.wait_for({ loaded: true });

    this.register_commands();
    this.register_folder_menu();
    this.register_files_menu();
    ContextsDashboardView.register_item_view(this);

    this.addSettingTab(new SmartContextSettingTab(this.app, this));


    /* ── First‑run onboarding ───────────────────────────────────────── */
    if (this.is_new_user()) {                         // ← NEW
      setTimeout(() => {
        StoryModal.open(this, {
          title: 'Getting Started With Smart Context',
          url: 'https://smartconnections.app/story/smart-context-getting-started/?utm_source=sc-new-user',
        });
      }, 1000);
      await this.save_installed_at(Date.now());
    }
  }


  /* ------------------------------------------------------------------ */
  /*  New‑user state (mirrors sc‑obsidian)                              */
  /* ------------------------------------------------------------------ */

  /**
   * Reads persisted install date (or migrates legacy localStorage flag).
   *
   * @private
   * @returns {Promise<void>}
   */
  async load_new_user_state() {
    this._installed_at = null;
    const data = await this.loadData();
    if (data && typeof data.installed_at !== 'undefined') {
      this._installed_at = data.installed_at;
    }
  }

  /**
   * Persists installation timestamp.
   *
   * @private
   * @param {number} ts
   */
  async save_installed_at(ts) {
    this._installed_at = ts;
    const data = (await this.loadData()) ?? {};
    data.installed_at = ts;
    await this.saveData(data);
  }

  /**
   * @returns {boolean}
   */
  is_new_user() { return !this._installed_at; }

  /* ------------------------------------------------------------------ */
  /*  UI helpers & menus                                                */
  /* ------------------------------------------------------------------ */
  register_folder_menu() {
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFolder)) return;
      menu.addItem((item) => {
        item
          .setTitle('Copy folder contents to clipboard')
          .setIcon('documents')
          .onClick(async () => { await this.copy_folder_to_clipboard(file); });
      });
    }));
  }

  register_files_menu() {
    this.registerEvent(this.app.workspace.on('files-menu', (menu, files) => {
      const selected_keys = get_selected_note_keys(files, this.env.smart_sources);
      if (selected_keys.length < 2) return;

      menu.addItem((item) => {
        item
          .setTitle('Copy selected notes as context')
          .setIcon('documents')
          .onClick(async () => {
            await this.copy_selected_files_to_clipboard(files);
          });
      });
    }));
  }

  get_relative_path(child_path, parent_path) {
    if (child_path === parent_path) return '';
    if (!child_path.startsWith(parent_path)) return child_path;
    let rel = child_path.slice(parent_path.length);
    if (rel.startsWith('/')) rel = rel.slice(1);
    return rel;
  }

  /* ------------------------------------------------------------------ */
  /*  Commands                                                          */
  /* ------------------------------------------------------------------ */
  get commands () {
    return {
      new_context: {
        id: 'new-context-open-selector',
        name: 'New Context: Open Context Selector',
        checkCallback: (checking) => {
          if (!this?.env?.smart_contexts) return false;
          if (checking) return true;
          this.open_new_context_modal();
          return true;
        },
      },
      get_started: {
        id: 'show-getting-started',
        name: 'Show getting started',
        callback: () => {
          StoryModal.open(this, {
            title: 'Getting Started With Smart Context',
            url: 'https://smartconnections.app/story/smart-context-getting-started/?utm_source=sc-command',
          });
        },
      },
      copy_current: {
        id: 'copy-current-note-with-depth',
        name: 'Copy current note to clipboard',
        editorCheckCallback: (checking, editor, view) => {
          const source_path = view.file?.path;
          if(!source_path) return false;
          const source = this.env.smart_sources.get(source_path);
          if(!source) return false;
          const ModalClass = this.env.config.modals?.copy_context_modal?.class;
          if (!ModalClass) return false;
          if(checking) return true; // TODO: what checks should we do here?
          source.actions.source_get_context().then((ctx) => {
            if(!ctx) {
              this.env.events.emit('notification:error', {
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
      }
    }
  }

  register_commands() {
    Object.values(this.commands).forEach((cmd) => {
      this.addCommand(cmd);
    });
    /**
     * TODO: REVIEW BELOW
     */
    // // Command: copy current note
    // this.addCommand({
    //   id: 'copy-current-note-with-depth',
    //   name: 'Copy current note to clipboard',
    //   editorCheckCallback: (checking) => {
    //     const active_file = this.app.workspace.getActiveFile();
    //     if(!active_file) return false;
    //     const base_items = [{key: active_file.path, path: active_file.path}];
    //     if (!base_items.length || !base_items[0]) return false;
    //     if (checking) return true;

    //     new this.LinkDepthModal(this, base_items).open();
    //     return true;
    //   },
    // });
    // Command: copy visible open files
    this.addCommand({
      id: 'copy-visible-open-files',
      name: 'Copy visible open files (pick link depth)',
      checkCallback: (checking) => {
        const base_items = get_visible_open_files(this.app);
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

  /**
   * Create a fresh SmartContext item and open the ContextModal on it.
   * @param {object} [params]
   */
  open_new_context_modal(params = {}) {
    const ctx = this.env.smart_contexts.new_context();
    // Open the modal bound to this new SmartContext
    ctx.emit_event('context_selector:open', params);
  }

  /* ------------------------------------------------------------------ */
  /*  Clipboard actions                                                 */
  /* ------------------------------------------------------------------ */
  async copy_folder_to_clipboard(folder) {
    const add_items = this.env.smart_sources
      .filter({ key_starts_with: folder.path })
      .map((src) => src.key);

    const ctx = this.env.smart_contexts.new_context({}, { add_items });
    const { context, stats, images } = await ctx.compile({ link_depth: 0 });

    await this.copy_to_clipboard(context, images);
    this.showStatsNotice(stats, `Folder: ${folder.path}`);
  }

  async copy_selected_files_to_clipboard(files) {
    const add_items = get_selected_note_keys(files, this.env.smart_sources);
    if (!add_items.length) {
      new Notice('No Smart Context notes found in selection.');
      return;
    }

    const ctx = this.env.smart_contexts.new_context({}, { add_items });
    const { context, stats, images } = await ctx.compile({ link_depth: 0 });

    await this.copy_to_clipboard(context, images);
    this.showStatsNotice(stats, `Selected notes (${add_items.length})`);
  }

  async copy_to_clipboard(text) { await copy_to_clipboard(text); }

  showStatsNotice(stats, contextMsg) { show_stats_notice(stats, contextMsg); }
}
