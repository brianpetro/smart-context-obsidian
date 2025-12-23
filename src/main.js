import {
  Plugin,
  Notice,
  TFolder,
} from 'obsidian';
import { SmartPlugin } from "obsidian-smart-env/smart_plugin.js";

import { SmartEnv, merge_env_config } from 'obsidian-smart-env';


import { SmartContextSettingTab } from './views/settings_tab.js';


import { copy_to_clipboard } from 'obsidian-smart-env/utils/copy_to_clipboard.js';
import { show_stats_notice } from './utils/show_stats_notice.js';

import { get_selected_note_keys } from './utils/get_selected_note_keys.js';
import { get_selected_context_item_keys } from './utils/get_selected_context_item_keys.js';

import { StoryModal } from 'obsidian-smart-env/src/modals/story.js';  // ← NEW

// v2
import { ContextsDashboardView } from './views/contexts_dashboard_view.js';
import { smart_env_config } from './default.config.js';
import {context_commands} from './commands/context_commands.js'

/**
 * Smart Context (Obsidian) – copy & curate context for AI tools.
 *
 * @extends Plugin
 */
export default class SmartContextPlugin extends SmartPlugin {
  SmartEnv = SmartEnv;
  onload() {
    this.app.workspace.onLayoutReady(this.initialize.bind(this));
    this.SmartEnv.create(this, smart_env_config);
  }

  onunload() {
    try { this.unregister_event_bus_handlers(); } catch (e) { /* no-op */ }
    this.env.unload_main(this);
  }

  /**
   * Top-level bootstrap after Obsidian workspace is ready.
   * Handles first-run onboarding, command registration, menus, etc.
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.load_new_user_state();                 // ← NEW
    await this.SmartEnv.wait_for({ loaded: true });

    this.register_commands();
    this.register_folder_menu();
    this.register_files_menu();
    ContextsDashboardView.register_item_view(this);

    this.addSettingTab(new SmartContextSettingTab(this.app, this));


    /* ── First-run onboarding ───────────────────────────────────────── */
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
  /*  New-user state (mirrors sc-obsidian)                              */
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
      menu.addItem((item) => {
        item
          .setTitle('Open folder in Context Builder')
          .setIcon('layout-list')
          .onClick(async () => {
            const folder_prefix = normalize_folder_prefix(file.path);
            const folder_item_keys = this.env.smart_sources
              .filter({ key_starts_with: folder_prefix })
              .map((src) => src.key)
            ;
            this.open_new_context_modal({ add_items: folder_item_keys });
          });
      });
    }));
  }

  register_files_menu() {
    this.registerEvent(this.app.workspace.on('files-menu', (menu, files) => {
      const folder_paths = get_selected_folder_paths(files);
      const has_folders = folder_paths.length > 0;

      const selected_item_keys = get_selected_context_item_keys(files, this.env.smart_sources);

      if (selected_item_keys.length > 0 || has_folders) {
        menu.addItem((item) => {
          item
            .setTitle('Open selection in Context Builder')
            .setIcon('layout-list')
            .onClick(async () => {
              this.open_new_context_modal({ add_items: selected_item_keys });
            });
        });
      }

      const selected_keys = get_selected_note_keys(files, this.env.smart_sources);
      if (selected_keys.length > 1) {
        menu.addItem((item) => {
          item
            .setTitle('Copy selected notes as context')
            .setIcon('documents')
            .onClick(async () => {
              await this.copy_selected_files_to_clipboard(files);
            });
        });
      }
      
      if (folder_paths.length > 1) {
        menu.addItem((item) => {
          item
            .setTitle("Copy selected folders as context")
            .setIcon("documents")
            .onClick(async () => {
              await this.copy_selected_folders_to_clipboard(files);
            });
        });
      }

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
      ...context_commands(this)
    }
  }

  /**
   * Create a fresh SmartContext item and open the ContextModal on it.
   * @param {object} [params]
   */
  open_new_context_modal(params = {}) {
    const add_items = Array.isArray(params.add_items) ? params.add_items : [];

    const ctx = this.env.smart_contexts.new_context({}, { add_items });

    // Do not forward add_items to the selector modal event payload.
    // The SmartContext is already hydrated with those items.
    const { add_items: _ignored, ...selector_params } = params || {};

    // Open the modal bound to this new SmartContext
    ctx.emit_event('context_selector:open', selector_params);
  }

  /* ------------------------------------------------------------------ */
  /*  Clipboard actions                                                 */
  /* ------------------------------------------------------------------ */
  async copy_folder_to_clipboard(folder) {
    const add_items = this.env.smart_sources
      .filter({ key_starts_with: folder.path })
      .map((src) => src.key);

    const ctx = this.env.smart_contexts.new_context({}, { add_items });
    ctx.actions.context_copy_to_clipboard();
  }

  async copy_selected_files_to_clipboard(files) {
    const add_items = get_selected_note_keys(files, this.env.smart_sources);
    if (!add_items.length) {
      new Notice('No Smart Context notes found in selection.');
      return;
    }

    const ctx = this.env.smart_contexts.new_context({}, { add_items });
    ctx.actions.context_copy_to_clipboard();
  }

  /**
   * Copy all notes within the selected folders to clipboard as a single context.
   *
   * @param {Array<{path?: string, children?: unknown}>} files
   * @returns {Promise<void>}
   */
  async copy_selected_folders_to_clipboard(files) {
    const folder_paths = get_selected_folder_paths(files);
    if (!folder_paths.length) {
      new Notice("No folders found in selection.");
      return;
    }

    const item_keys = new Set();

    for (const folder_path of folder_paths) {
      const prefix = normalize_folder_prefix(folder_path);
      const matches = this.env.smart_sources
        .filter({ key_starts_with: prefix })
        .map((src) => src.key);

      for (const key of matches) {
        if (key) item_keys.add(key);
      }
    }

    const add_items = [...item_keys];

    if (!add_items.length) {
      new Notice("No Smart Context notes found in selected folders.");
      return;
    }

    const ctx = this.env.smart_contexts.new_context({}, { add_items });
    ctx.actions.context_copy_to_clipboard();
  }

  async copy_to_clipboard(text) { await copy_to_clipboard(text); }

  showStatsNotice(stats, contextMsg) { show_stats_notice(stats, contextMsg); }
}


/**
 * Ensure folder prefix matches only items *inside* the folder.
 * Prevents accidental matches like:
 *   folder "foo" matching "foobar/file.md"
 *
 * @param {string} folder_path
 * @returns {string}
 */
function normalize_folder_prefix(folder_path) {
  const raw = String(folder_path ?? "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

/**
 * Extract unique folder paths selected in the file explorer.
 *
 * Obsidian supplies an array of TAbstractFile entries to the `files-menu` event.
 * TFolder instances include a `children` array; TFile instances do not.
 *
 * Kept dependency-free so it can be unit tested without Obsidian runtime.
 *
 * @param {Array<{path?: string, children?: unknown}>} files
 * @returns {string[]}
 */
function get_selected_folder_paths(files = []) {
  if (!Array.isArray(files)) return [];

  const seen = new Set();
  /** @type {string[]} */
  const paths = [];

  for (const file of files) {
    const is_folder = Array.isArray(file?.children);
    if (!is_folder) continue;

    const folder_path = file?.path;
    if (!folder_path || seen.has(folder_path)) continue;

    seen.add(folder_path);
    paths.push(folder_path);
  }

  return paths;
}
