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

import { StoryModal } from 'obsidian-smart-env/modals/story.js';  // ← NEW

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
  onload() {
    this.app.workspace.onLayoutReady(this.initialize.bind(this));
    SmartEnv.create(this, smart_env_config);
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
      ...context_commands(this)
    }
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

  async copy_to_clipboard(text) { await copy_to_clipboard(text); }

  showStatsNotice(stats, contextMsg) { show_stats_notice(stats, contextMsg); }
}
