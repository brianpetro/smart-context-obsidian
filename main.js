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
import { SmartContextSettingTab } from './settings.js';

import { smart_env_config } from './smart_env.config.js';

import { FolderSelectModal } from './src/views/folder_select_modal.js';
import { ContextSelectorModal } from './src/views/context_selector_modal.js';

import { copy_to_clipboard } from './src/utils/copy_to_clipboard.js';
import { show_stats_notice } from './src/utils/show_stats_notice.js';

import { get_all_open_file_paths } from './src/utils/get_all_open_file_paths.js';
import { get_visible_open_files } from './src/utils/get_visible_open_files.js';

import { build_folder_tree_for_path } from './src/utils/build_folder_tree_for_path.js';

import { StoryModal } from 'obsidian-smart-env/modals/story.js';  // ← NEW

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
  ContextSelectorModal = ContextSelectorModal;
  LinkDepthModal = LinkDepthModal;

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

  onunload() { this.env.unload_main(this); }

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
    this.register_context_selector_modal_command();
    this.register_folder_menu();

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
          .setTitle('Copy file-folder tree')
          .setIcon('copy')
          .onClick(async () => { await this.copy_folder_tree_to_clipboard(file); });
      });
      menu.addItem((item) => {
        item
          .setTitle('Copy folder contents to clipboard')
          .setIcon('documents')
          .onClick(async () => { await this.copy_folder_to_clipboard(file); });
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
  register_context_selector_modal_command() {
    this.addCommand({
      id: 'open-context-select-modal',
      name: 'Context selector',
      callback: () => { ContextSelectorModal.open(this.env); },
    });
  }

  register_commands() {
    // Command: copy current note
    this.addCommand({
      id: 'copy-current-note-with-depth',
      name: 'Copy current note to clipboard',
      checkCallback: (checking) => {
        const active_file = this.app.workspace.getActiveFile();
        if(!active_file) return false;
        const base_items = [{key: active_file.path, path: active_file.path}];
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

    /* ── Getting‑Started command ────────────────────────────────────── */
    this.addCommand({
      id: 'show-getting-started',
      name: 'Show getting started',
      callback: () => {
        StoryModal.open(this, {
          title: 'Getting Started With Smart Context',
          url: 'https://smartconnections.app/story/smart-context-getting-started/?utm_source=sc-command',
        });
      },
    });
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

  /**
   * Copy an ASCII representation of the folder tree to the clipboard.
   *
   * @param {TFolder} folder
   * @returns {Promise<void>}
   */
  async copy_folder_tree_to_clipboard(folder) {
    const fs = this.env.smart_sources?.fs;
    if (!fs) {
      new Notice('Folder tree unavailable: Smart Context sources are still loading.');
      return;
    }

    const tree = build_folder_tree_for_path(
      folder?.path ?? '',
      fs.file_paths ?? [],
      fs.folder_paths ?? [],
    );

    if (!tree.trim()) {
      new Notice(`No files found under ${folder?.path || 'this folder'}.`);
      return;
    }

    await this.copy_to_clipboard(tree);
    this.showStatsNotice(null, `Folder tree: ${folder?.path || '/'}`);
  }

  async copy_to_clipboard(text) { await copy_to_clipboard(text); }

  showStatsNotice(stats, contextMsg) { show_stats_notice(stats, contextMsg); }
}
