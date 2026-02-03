import {
  Plugin,
  Notice,
  TFolder,
} from 'obsidian';
import { SmartPlugin } from 'obsidian-smart-env/smart_plugin.js';

import { SmartEnv, merge_env_config } from 'obsidian-smart-env';

import { SmartContextSettingTab } from './views/settings_tab.js';

import { copy_to_clipboard } from 'obsidian-smart-env/utils/copy_to_clipboard.js';
import { show_stats_notice } from './utils/show_stats_notice.js';

import { get_selected_note_keys } from './utils/get_selected_note_keys.js';
import { get_selected_context_item_keys } from './utils/get_selected_context_item_keys.js';
import {
  expand_folders_to_item_keys,
  get_selected_folder_paths,
  normalize_folder_prefix,
} from './utils/folder_selection.js';

import { StoryModal } from 'obsidian-smart-env/src/modals/story.js';

// v2
import { ContextsDashboardView } from './views/contexts_dashboard_view.js';
import { ReleaseNotesView } from './views/release_notes_view.js';
import { smart_env_config } from './default.config.js';
import { context_commands } from './commands/context_commands.js';

/**
 * Smart Context (Obsidian) - copy and curate context for AI tools.
 *
 * @extends Plugin
 */
export default class SmartContextPlugin extends SmartPlugin {
  SmartEnv = SmartEnv;
  ReleaseNotesView = ReleaseNotesView;

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
    await this.load_new_user_state();
    await this.SmartEnv.wait_for({ loaded: true });

    this.register_commands();
    this.register_ribbon_icons(); // from SmartPlugin
    this.register_folder_menu();
    this.register_files_menu();

    ContextsDashboardView.register_item_view(this);
    this.ReleaseNotesView.register_item_view(this);

    this.addSettingTab(new SmartContextSettingTab(this.app, this));

    // First-run onboarding
    if (this.is_new_user()) {
      setTimeout(() => {
        StoryModal.open(this, {
          title: 'Getting Started With Smart Context',
          url: 'https://smartconnections.app/story/smart-context-getting-started/?utm_source=sc-new-user',
        });
      }, 1000);
      await this.save_installed_at(Date.now());
    }

    await this.check_for_updates();
  }

  /* ------------------------------------------------------------------ */
  /*  Release notes (mirrors smart-connections behavior)                 */
  /* ------------------------------------------------------------------ */

  /**
   * Open ReleaseNotesView when this installed plugin version is newer than
   * the last version this user has seen.
   *
   * Uses SmartPlugin helpers when available, with a safe fallback.
   *
   * @returns {Promise<void>}
   */
  async check_for_updates() {
    const version = this.manifest?.version;
    if (!version) return;

    const can_use_base =
      typeof this.is_new_plugin_version === 'function' &&
      typeof this.set_last_known_version === 'function';

    if (can_use_base) {
      try {
        const is_new = await this.is_new_plugin_version(version);
        if (!is_new) return;

        try {
          ReleaseNotesView.open(this.app.workspace, version);
        } catch (err) {
          console.error('Failed to open ReleaseNotesView', err);
        }

        await this.set_last_known_version(version);
      } catch (err) {
        console.warn('check_for_updates failed (base helpers)', err);
      }
      return;
    }

    // Fallback storage in plugin data
    try {
      const data = (await this.loadData()) ?? {};
      const last = data.last_known_version;
      if (last === version) return;

      try {
        ReleaseNotesView.open(this.app.workspace, version);
      } catch (err) {
        console.error('Failed to open ReleaseNotesView', err);
      }

      data.last_known_version = version;
      await this.saveData(data);
    } catch (err) {
      console.warn('check_for_updates failed (fallback)', err);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  New-user state (mirrors sc-obsidian)                               */
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
  /*  UI helpers & menus                                                 */
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
            .setTitle('Copy selected folders as context')
            .setIcon('documents')
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

  get commands() {
    return {
      ...context_commands(this),
    };
  }
  get ribbon_icons () {
    return {
      new_context: {
        icon_name: "smart-context-builder",
        description: "Smart Context: Open Builder",
        callback: () => { this.open_new_context_modal(); }
      },
      copy_context: {
        icon_name: "smart-copy-note",
        description: "Smart Context: Copy to Clipboard (select depth)",
        callback: async () => {
          this.app.commands.executeCommandById('smart-context:copy-current-note-with-depth');
        }
      },
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

  /**
   * Emit the file navigator copy milestone event.
   *
   * @param {import('smart-contexts').SmartContext} ctx
   */
  emit_file_nav_copy_event(ctx) {
    if (!ctx?.emit_event) return;
    ctx.emit_event('context:file_nav_copied');
  }

  async copy_folder_to_clipboard(folder) {
    const add_items = expand_folders_to_item_keys([folder?.path], this.env.smart_sources);

    const ctx = this.env.smart_contexts.new_context({}, { add_items });
    this.emit_file_nav_copy_event(ctx);
    ctx.actions.context_copy_to_clipboard();
  }

  async copy_selected_files_to_clipboard(files) {
    const add_items = get_selected_note_keys(files, this.env.smart_sources);
    if (!add_items.length) {
      new Notice('No Smart Context notes found in selection.');
      return;
    }

    const ctx = this.env.smart_contexts.new_context({}, { add_items });
    this.emit_file_nav_copy_event(ctx);
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
      new Notice('No folders found in selection.');
      return;
    }

    const add_items = expand_folders_to_item_keys(folder_paths, this.env.smart_sources);

    if (!add_items.length) {
      new Notice('No Smart Context notes found in selected folders.');
      return;
    }

    const ctx = this.env.smart_contexts.new_context({}, { add_items });
    this.emit_file_nav_copy_event(ctx);
    ctx.actions.context_copy_to_clipboard();
  }

  async copy_to_clipboard(text) { await copy_to_clipboard(text); }

  showStatsNotice(stats, contextMsg) { show_stats_notice(stats, contextMsg); }
}
