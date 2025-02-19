/******************************************************
 * main.js
 * @fileoverview
 * Obsidian plugin entry point for Smart Context.
 ******************************************************/

import {
  Plugin,
  Notice,
  TFolder,
  PluginSettingTab,
  normalizePath,
} from 'obsidian';
import path from 'path';

import { SmartFs } from 'smart-file-system/smart_fs.js';
import { SmartFsObsidianAdapter } from 'smart-file-system/adapters/obsidian.js';
import {
  should_ignore,
  is_text_file
} from 'smart-file-system/utils/ignore.js';

import { SmartEnv } from 'smart-environment/obsidian.js';

import { ContextSelectModal } from './context_select_modal.js';
import { ExternalSelectModal } from './external_select_modal.js';
import { FolderSelectModal } from './folder_select_modal.js';
import { LinkDepthModal } from './link_depth_modal.js';

import { SmartContexts, SmartContext } from 'smart-contexts';
import { AjsonMultiFileCollectionDataAdapter } from 'smart-collections/adapters/ajson_multi_file.js';

export default class SmartContextPlugin extends Plugin {
  /**
   * Plugin-level config for hooking up "smart_env" modules.
   */
  smart_env_config = {
    collections: {
      smart_contexts: {
        class: SmartContexts,
        data_adapter: AjsonMultiFileCollectionDataAdapter
      },
    },
    item_types: {
      SmartContext
    },
    modules: {
      smart_fs: {
        class: SmartFs,
        adapter: SmartFsObsidianAdapter,
      },
    },
  };

  async onload() {
    console.log('Loading SmartContextPlugin...');

    // Initialize environment after Obsidian is ready
    await SmartEnv.create(this, this.smart_env_config);

    this.register_commands();

    // Right-click menu for folders
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle('Copy folder contents to clipboard')
              .setIcon('documents')
              .onClick(async () => {
                await this.copy_folder_without_modal(file);
              });
          });
        }
      })
    );

    // Settings tab
    this.addSettingTab(new SmartContextSettingTab(this.app, this));

    console.log('SmartContextPlugin loaded');
  }

  onunload() {
    console.log('Unloading SmartContextPlugin...');
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

  register_commands() {
    // Command: copy current note
    this.addCommand({
      id: 'copy-current-note-with-depth',
      name: 'Copy current note to clipboard',
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return false;
        if (checking) return true;

        (async () => {
          const itemsSet = new Set([ activeFile.path ]);

          const items_obj = {};
          for (const p of itemsSet) {
            items_obj[p] = true;
          }
          const sc_item = this.env.smart_contexts.create_or_update({ context_items: items_obj });
          // open link depth modal
          new LinkDepthModal(this.app, this, sc_item).open();
        })();

        return true;
      },
    });

    // Command: copy visible open files
    this.addCommand({
      id: 'copy-visible-open-files',
      name: 'Copy visible open files (pick link depth)',
      checkCallback: (checking) => {
        const visible_files = this.get_visible_open_files();
        if (!visible_files.size) return false;
        if (checking) return true;

        (async () => {
          const itemsSet = new Set();
          for (const f of visible_files) {
            itemsSet.add(f.path);
          }

          const items_obj = {};
          for (const p of itemsSet) {
            items_obj[p] = true;
          }
          const sc_item = this.env.smart_contexts.create_or_update({ context_items: items_obj });
          new LinkDepthModal(this.app, this, sc_item).open();
        })();

        return true;
      },
    });

    // Command: copy all open files
    this.addCommand({
      id: 'copy-all-open-files',
      name: 'Copy all open files (pick link depth)',
      checkCallback: (checking) => {
        const all_files_set = this.get_all_open_files();
        if (!all_files_set.size) return false;
        if (checking) return true;

        (async () => {
          const itemsSet = new Set(all_files_set.map(f => f.path));

          const items_obj = {};
          for (const p of itemsSet) {
            items_obj[p] = true;
          }
          const sc_item = this.env.smart_contexts.create_or_update({ context_items: items_obj });
          new LinkDepthModal(this.app, this, sc_item).open();
        })();

        return true;
      },
    });

    // Command: copy folder contents
    this.addCommand({
      id: 'copy-folder-contents-with-depth',
      name: 'Copy folder contents (no modal, depth=0)',
      callback: () => {
        new FolderSelectModal(this.app, async (folder) => {
          if (!folder) return;
          await this.copy_folder_without_modal(folder);
        }).open();
      },
    });

    // External file browser
    this.addCommand({
      id: 'open-external-file-browser',
      name: 'Open External File Browser',
      checkCallback: (checking) => {
        if (this.app.isMobile) {
          if (!checking) {
            new Notice('This command is only available on desktop.');
          }
          return false;
        }
        if (!checking) {
          this.open_external_file_modal();
        }
        return true;
      },
    });

    // Build context (multiple file selection)
    this.addCommand({
      id: 'open-context-select-modal',
      name: 'Build Context (pick multiple vault notes)',
      callback: () => {
        const modal = new ContextSelectModal(this.app, this);
        modal.open();
      },
    });
  }

  /**
   * Copy folder contents at depth=0, without a modal.
   */
  async copy_folder_without_modal(folder) {
    const sc_item = this.env.smart_contexts.create_or_update({
      context_items: { [folder.path]: true }
    });
    const { context, stats } = await sc_item.compile({ link_depth: 0 });
    await this.copy_to_clipboard(context);
    this.showStatsNotice(stats, `Folder: ${folder.path}`);
  }

  /**
   * Collect only visible open files.
   */
  get_visible_open_files() {
    const leaves = this.get_all_leaves();
    const visible_files = new Set();
    for (const leaf of leaves) {
      if (!this.is_leaf_visible(leaf)) continue;
      const file = leaf.view?.file;
      if (file && is_text_file(file.path)) {
        visible_files.add(file);
      }
    }
    return visible_files;
  }

  /**
   * Collect all open files in the workspace.
   */
  get_all_open_files() {
    const leaves = this.get_all_leaves();
    const files_set = new Set();
    for (const leaf of leaves) {
      const file = leaf.view?.file;
      if (file && is_text_file(file.path)) {
        files_set.add(file);
      }
    }
    return files_set;
  }

  /**
   * Recursively gather workspace leaves.
   */
  get_all_leaves() {
    const leaves = [];
    const recurse = (container) => {
      if (container.children) {
        for (const child of container.children) {
          recurse(child);
        }
      }
      if (container.type === 'leaf') {
        leaves.push(container);
      }
    };
    recurse(this.app.workspace.rootSplit);
    return leaves;
  }

  /**
   * Is a leaf the active tab in its parent container?
   */
  is_leaf_visible(leaf) {
    const parent = leaf.parent;
    if (!parent) {
      return leaf.containerEl && leaf.containerEl.offsetParent !== null;
    }
    if ('activeTab' in parent) {
      return (
        parent.activeTab === leaf &&
        leaf.containerEl &&
        leaf.containerEl.offsetParent !== null
      );
    }
    return leaf.containerEl && leaf.containerEl.offsetParent !== null;
  }

  /**
   * Copy text to clipboard.
   */
  async copy_to_clipboard(text) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const { clipboard } = require('electron');
        clipboard.writeText(text);
      }
    } catch (err) {
      console.error('Failed to copy text:', err);
      new Notice('Failed to copy.');
    }
  }

  /**
   * Show user-facing notice summarizing stats.
   */
  showStatsNotice(stats, contextMsg) {
    let noticeMsg = `Copied to clipboard! (${contextMsg})`;
    if (stats) {
      const char_count =
        stats.char_count < 100000
          ? stats.char_count
          : `~${Math.round(stats.char_count / 1000)}k`;
      noticeMsg += `, ${char_count} chars`;

      if (stats.exclusions) {
        const total_excluded = Object.values(stats.exclusions).reduce((p, c) => p + c, 0);
        if (total_excluded > 0) {
          noticeMsg += `, ${total_excluded} section(s) excluded`;
        }
      }
    }
    new Notice(noticeMsg);
  }

  /**
   * External file browser from vault's parent folder (desktop only).
   */
  open_external_file_modal() {
    const vaultBasePath = normalizePath(this.app.vault.adapter.basePath);
    const parentFolder = path.dirname(vaultBasePath);
    const modal = new ExternalSelectModal(this.app, parentFolder, vaultBasePath);
    modal.open();
  }
}

/**
 * A simple plugin settings tab that delegates config to the env.smart_view system.
 */
class SmartContextSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.env = plugin.env;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    Object.entries(this.plugin.env.smart_contexts.settings_config).forEach(([setting, config]) => {
      const setting_html = this.env.smart_view.render_setting_html({
        setting,
        ...config,
      });
      const frag = this.env.smart_view.create_doc_fragment(setting_html);
      containerEl.appendChild(frag);
    });

    this.env.smart_view.render_setting_components(containerEl, {
      scope: this.plugin.env.smart_contexts
    });
  }
}
