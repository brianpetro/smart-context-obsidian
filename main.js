/******************************************************
 * main.js
 * @fileoverview
 * Obsidian plugin entry point for Smart Context.
 * - All "copy" commands open a LinkDepthModal, but we also
 *   always parse 'smart-context' codeblocks in each file
 *   (regardless of link depth) to gather references.
 ******************************************************/

import {
  Plugin,
  Notice,
  TFolder,
  PluginSettingTab,
  normalizePath,
} from 'obsidian';
import fs from 'fs';
import path from 'path';

import { SmartFs } from 'smart-file-system/smart_fs.js';
import { SmartFsObsidianAdapter } from 'smart-file-system/adapters/obsidian.js';
import {
  load_ignore_patterns,
  should_ignore,
  is_text_file
} from 'smart-file-system/utils/ignore.js';

import { wait_for_smart_env_then_init } from 'obsidian-smart-env';

import { ContextSelectModal } from './context_select_modal.js';
import { ExternalSelectModal } from './external_select_modal.js';
import { FolderSelectModal } from './folder_select_modal.js';
import { LinkDepthModal } from './link_depth_modal.js';

import { SmartContexts, SmartContext } from 'smart-contexts';

export default class SmartContextPlugin extends Plugin {
  /**
   * Plugin-level config for hooking up "smart_env" modules.
   */
  smart_env_config = {
    collections: {
      smart_contexts: {
        class: SmartContexts,
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
    wait_for_smart_env_then_init(this, this.smart_env_config).then(() => {
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
                  await this.open_folder_depth_modal(file);
                });
            });
          }
        })
      );

      // Settings tab
      this.addSettingTab(new SmartContextSettingTab(this.app, this));

      console.log('SmartContextPlugin loaded');
    });
  }

  onunload() {
    console.log('Unloading SmartContextPlugin...');
  }

  /**
   * Register commands:
   *  - Copy current note (opens link depth modal)
   *  - Copy visible open files (opens link depth modal)
   *  - Copy all open files (opens link depth modal)
   *  - Copy folder contents (opens link depth modal)
   *  - External file browser
   *  - Build context (multiple note selection)
   */
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
          // Start with the single active file
          const itemsSet = new Set([ activeFile.path ]);
          // Expand codeblocks inside that file (or newly added ones):
          await this.expand_items_with_codeblocks(itemsSet);
          // Then pass to the SmartContext
          const items_obj = {};
          for (const path of itemsSet) {
            items_obj[path] = true;
          }
          const sc_item = this.env.smart_contexts.create_or_update({ items: items_obj });
          // Open link depth modal
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
          // Expand codeblocks
          await this.expand_items_with_codeblocks(itemsSet);

          const items_obj = {};
          for (const p of itemsSet) {
            items_obj[p] = true;
          }
          const sc_item = this.env.smart_contexts.create_or_update({ items: items_obj });
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
          const itemsSet = new Set();
          for (const f of all_files_set) {
            itemsSet.add(f.path);
          }
          // Expand codeblocks
          await this.expand_items_with_codeblocks(itemsSet);

          const items_obj = {};
          for (const p of itemsSet) {
            items_obj[p] = true;
          }
          const sc_item = this.env.smart_contexts.create_or_update({ items: items_obj });
          new LinkDepthModal(this.app, this, sc_item).open();
        })();

        return true;
      },
    });

    // Command: copy folder contents
    this.addCommand({
      id: 'copy-folder-contents-with-depth',
      name: 'Copy folder contents (pick link depth)',
      callback: () => {
        new FolderSelectModal(this.app, async (folder) => {
          if (!folder) return;
          await this.open_folder_depth_modal(folder);
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
   * "Copy folder contents" flow. Then open LinkDepthModal.
   * This also expands codeblocks in each file found.
   */
  async open_folder_depth_modal(folder) {
    const files = this.get_files_from_folder(folder, true);
    if (!files.length) {
      new Notice('No recognized text files found in the selected folder.');
      return;
    }
    const itemsSet = new Set();
    for (const f of files) {
      itemsSet.add(f.path);
    }
    // Expand codeblocks
    await this.expand_items_with_codeblocks(itemsSet);

    const items_obj = {};
    for (const p of itemsSet) {
      items_obj[p] = true;
    }
    const sc_item = this.env.smart_contexts.create_or_update({ items: items_obj });
    new LinkDepthModal(this.app, this, sc_item).open();
  }

  /**
   * Expand item set by parsing '```smart-context' blocks in each file.
   * Each path from the codeblock can be:
   *  - A single file => add to itemsSet
   *  - A directory => recursively gather subfiles (respecting .scignore/.gitignore)
   *
   * We do BFS: each time we find a new file from a codeblock, we parse that file too.
   */
  async expand_items_with_codeblocks(itemsSet) {
    const queue = Array.from(itemsSet);
    const processed = new Set();

    while (queue.length) {
      const filePath = queue.shift();
      if (processed.has(filePath)) continue;
      processed.add(filePath);

      // read the file content
      let fileEntry = this.app.vault.getAbstractFileByPath(filePath);
      // If it doesn't exist in vault or isn't a TFile, skip
      if (!fileEntry || !('extension' in fileEntry)) continue;

      const content = await this.app.vault.read(fileEntry);
      const codeblockPaths = this.parse_smart_context_codeblock_lines(content);

      // For each path => if directory => gather subfiles => else single file
      for (const linePath of codeblockPaths) {
        const abs = path.join(
          normalizePath(this.app.vault.adapter.basePath),
          linePath
        );
        try {
          const stat = fs.statSync(abs);
          if (!stat) continue;

          if (stat.isDirectory()) {
            // gather subfiles respecting .scignore/.gitignore
            const subPaths = this.gather_directory_files(abs);
            for (const sp of subPaths) {
              if (!itemsSet.has(sp)) {
                itemsSet.add(sp);
                queue.push(sp);
              }
            }
          } else {
            // single file
            const vaultRel = path.relative(
              normalizePath(this.app.vault.adapter.basePath),
              abs
            ).replace(/\\/g, '/');

            if (!itemsSet.has(vaultRel)) {
              itemsSet.add(vaultRel);
              queue.push(vaultRel);
            }
          }
        } catch (err) {
          console.warn(`Skipping invalid path from codeblock: ${linePath}`, err);
        }
      }
    }
  }

  /**
   * Parse out lines inside ```smart-context codeblocks in the file content.
   * Returns an array of raw lines, which might be file or folder references.
   */
  parse_smart_context_codeblock_lines(content) {
    const lines = content.split('\n');
    let inside = false;
    const results = [];
    for (const line of lines) {
      if (line.trimStart().startsWith('```smart-context')) {
        inside = true;
        continue;
      }
      if (inside && line.trimStart().startsWith('```')) {
        inside = false;
        continue;
      }
      if (inside) {
        const ref = line.trim();
        if (ref) results.push(ref);
      }
    }
    return results;
  }

  /**
   * BFS gather all text files under a directory 'absDir' respecting .scignore/.gitignore.
   */
  gather_directory_files(absDir) {
    const results = [];
    const ignore_patterns = load_ignore_patterns(absDir);
    const stack = [absDir];

    while (stack.length) {
      const current = stack.pop();
      try {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const e of entries) {
          const fullPath = path.join(current, e.name);
          if (e.isDirectory()) {
            // see if we ignore the folder's name
            const rel = path.relative(absDir, fullPath).replace(/\\/g, '/');
            if (!should_ignore(rel, ignore_patterns)) {
              stack.push(fullPath);
            }
          } else {
            // check ignore & extension
            const rel = path.relative(absDir, fullPath).replace(/\\/g, '/');
            if (!should_ignore(rel, ignore_patterns) && is_text_file(fullPath)) {
              // convert back to vault-relative
              const vaultRel = path.relative(
                normalizePath(this.app.vault.adapter.basePath),
                fullPath
              ).replace(/\\/g, '/');
              results.push(vaultRel);
            }
          }
        }
      } catch (err) {
        console.warn('Error reading directory:', current, err);
      }
    }
    return results;
  }

  /**
   * Collect only *visible* open files.
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
   * Collect all open files in the workspace (regardless of visibility).
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
   * Recursively gather text files from a folder (optionally subfolders).
   * This is used by the right-click "Copy folder contents" feature.
   * This method has no advanced ignoring beyond the top-level folder's .scignore/.gitignore,
   * because it checks only once at folder.path.
   */
  get_files_from_folder(folder, include_subfolders) {
    const results = [];
    const vault_base = normalizePath(this.app.vault.adapter.basePath);
    const folder_abs_path = path.join(vault_base, folder.path);

    // Load patterns from the folder root only
    const ignore_patterns = load_ignore_patterns(folder_abs_path);

    const process_folder = (currentFolder) => {
      for (const child of currentFolder.children) {
        if (child instanceof TFolder) {
          if (include_subfolders) {
            process_folder(child);
          }
        } else {
          // We'll do a simpler approach using the child's path relative to the selected "folder".
          // If the selected "folder" is the "rootFolder", we want "child.path" minus "folder.path".
          const rel = this.get_relative_path(child.path, folder.path);
          if (!should_ignore(rel, ignore_patterns) && is_text_file(child.path)) {
            results.push(child);
          }
        }
      }
    };
    process_folder(folder);
    return results;
  }


  /**
   * Copy text to clipboard, optionally merging with any codeblock context from the active file.
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
   * Show user-facing notice summarizing stats after copying.
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

    // Render each setting (collection-based)
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
