import {
  TFolder,
} from 'obsidian';
import { SmartPlugin } from 'obsidian-smart-env/smart_plugin.js';

import { SmartEnv, merge_env_config } from 'obsidian-smart-env';

import { SmartContextSettingTab } from './views/settings_tab.js';

import { copy_to_clipboard } from 'obsidian-smart-env/src/utils/copy_to_clipboard.js';
import { show_stats_notice } from './utils/show_stats_notice.js';

import {
  expand_folders_to_item_keys,
} from './utils/folder_selection.js';

import { StoryModal } from 'obsidian-smart-env/src/modals/story.js';

import { ContextsDashboardView } from './views/contexts_dashboard_view.js';
import { ReleaseNotesView } from './views/release_notes_view.js';
import { smart_env_config } from './default.config.js';
import { register_context_codeblock_processors } from './utils/register_context_codeblock_processors.js';

/**
 * Smart Context (Obsidian) - copy and curate context for AI tools.
 *
 * @extends SmartPlugin
 */
export default class SmartContextPlugin extends SmartPlugin {
  SmartEnv = SmartEnv;
  ReleaseNotesView = ReleaseNotesView;
  smart_env_config = smart_env_config;

  onload() {
    this.app.workspace.onLayoutReady(this.initialize.bind(this));
    this.SmartEnv.create(this, this.smart_env_config);
    ContextsDashboardView.register_item_view(this, { skip_command_registration: true });
    this.ReleaseNotesView.register_item_view(this, { skip_command_registration: true });
    this.addSettingTab(new SmartContextSettingTab(this.app, this, 'smart-context-builder'));
  }

  /**
   * Top-level bootstrap after Obsidian workspace is ready.
   * Handles first-run onboarding, command registration, menus, etc.
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.load_new_user_state();
    this.register_ribbon_actions();
    await this.SmartEnv.wait_for({ loaded: true });

    this.register_command_actions();
    this.register_codeblock_processors();
    this.register_folder_menu();
    this.register_files_menu();

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

    this.register_event_listeners();
  }

  register_codeblock_processors() {
    register_context_codeblock_processors(this);
  }

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
          this.ReleaseNotesView.open(this.app.workspace, version);
        } catch (error) {
          console.error('Failed to open ReleaseNotesView', error);
        }

        await this.set_last_known_version(version);
      } catch (error) {
        console.warn('check_for_updates failed (base helpers)', error);
      }
      return;
    }

    try {
      const data = (await this.loadData()) ?? {};
      const last = data.last_known_version;
      if (last === version) return;

      try {
        this.ReleaseNotesView.open(this.app.workspace, version);
      } catch (error) {
        console.error('Failed to open ReleaseNotesView', error);
      }

      data.last_known_version = version;
      await this.saveData(data);
    } catch (error) {
      console.warn('check_for_updates failed (fallback)', error);
    }
  }

  /**
   * Reads persisted install date.
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
  is_new_user() {
    return !this._installed_at;
  }

  register_folder_menu() {
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFolder)) return;

      this.env?.build_menu?.('env:folder_menu', menu, this.env, {
        plugin: this,
        file,
        folder: file,
        files: [file],
      });
    }));
  }

  register_files_menu() {
    this.registerEvent(this.app.workspace.on('files-menu', (menu, files) => {
      const selection = Array.isArray(files) ? files : [];
      this.env?.build_menu?.('env:files_menu', menu, this.env, {
        plugin: this,
        files: selection,
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

  /**
   * Create a fresh SmartContext item and open the ContextModal on it.
   * @param {object} [params]
   */
  open_new_context_modal(params = {}) {
    return this.env.smart_contexts.actions.smart_contexts_open_new(params);
  }

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

  async copy_to_clipboard(text, params = {}) {
    await copy_to_clipboard(text, params);
  }

  showStatsNotice(stats, contextMsg, params = {}) {
    show_stats_notice(stats, contextMsg, params);
  }

  register_event_listeners() {
    /**
     * Listen for context renames to update any codeblocks that reference the renamed context by name.
     */
    this.register(
      this.env.events.on('context:renamed', async (payload) => {
        const ctx = this.env.smart_contexts.get(payload.item_key);
        if (!ctx) {
          console.warn('Context not found for context:renamed event', payload);
          return;
        }
        const old_name = payload.old_name;
        const new_name = payload.name;
        const line_starts_with = `ctx:: ${old_name}`;
        const source_keys = Object.keys(ctx.data.codeblock_inclusions || {});
        for (let i = 0; i < source_keys.length; i++) {
          const source_key = source_keys[i];
          const t_file = this.env.smart_sources.get(source_key)?.t_file;
          if (!t_file){
            console.warn(`Source file not found for context codeblock inclusion with key "${source_key}"`);
            continue;
          }
          const content = await this.app.vault.read(t_file);
          const has_line = content.split('\n').some((line) => line.trim().startsWith(line_starts_with));
          if (!has_line) {
            console.warn(`Line starting with "${line_starts_with}" not found in file "${t_file.path}". Removing codeblock inclusion reference.`);
            // If the line isn't found, remove the codeblock inclusion reference to avoid future unnecessary checks.
            delete ctx.data.codeblock_inclusions[source_key];
            ctx.queue_save();
            continue;
          };
          const new_content = content.replace(line_starts_with, `ctx:: ${new_name}`);
          this.app.vault.modify(t_file, new_content);
          const cb_ctx = this.env.smart_contexts.get(source_key + '#codeblock');
          if (cb_ctx?.data?.context_items?.[old_name]) {
            delete cb_ctx.data.context_items[old_name];
            cb_ctx.data.context_items[new_name] = {
              key: new_name,
              named_context: true,
            };
          }
          ctx.emit_info_event('context:named_context_name_synced', {
            codeblock_source_key: source_key,
            old_name,
            new_name,
          });
        }
      })
    );
  }
}
