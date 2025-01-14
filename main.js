/******************************************************
 * main.js
 * @fileoverview
 * Updated Obsidian plugin entry point for Smart Context,
 * now using the new `smart-contexts/SmartContexts` approach.
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
import { ContextSelectModal } from './context_select_modal.js';
import { ExternalSelectModal } from './external_select_modal.js';
import { FolderSelectModal } from './folder_select_modal.js';
import {
  load_ignore_patterns,
  should_ignore,
  is_text_file,
} from 'smart-file-system/utils/ignore.js';
import { wait_for_smart_env_then_init } from 'obsidian-smart-env';

// Import the new collection
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
    console.log('Loading SmartContextPlugin2...');

    // 1) Initialize the environment and attach the new SmartContexts collection
    await wait_for_smart_env_then_init(this, this.smart_env_config);

    // 2) Register commands
    this.register_commands();

    // 3) Register the folder context-menu integration
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle('Copy folder contents to clipboard')
              .setIcon('documents')
              .onClick(async () => {
                await this.copy_folder_contents(file, true);
              });
          });
        }
      })
    );

    // 4) Plugin settings tab
    this.addSettingTab(new SmartContextSettingTab(this.app, this));

    console.log('SmartContextPlugin loaded');
  }

  onunload() {
    console.log('Unloading SmartContextPlugin...');
  }

  /**
   * Register all commands that were previously using smartContext.build_context,
   * now updated to use the new SmartContexts collection approach.
   */
  register_commands() {

    // Command: copy folder contents
    this.addCommand({
      id: 'copy-folder-contents',
      name: 'Copy folder contents to clipboard',
      callback: () => {
        new FolderSelectModal(this.app, async (folder) => {
          if (!folder) return;
          await this.copy_folder_contents(folder, true);
        }).open();
      },
    });

    // Command: copy the content of only currently visible open files
    this.addCommand({
      id: 'copy-visible-open-files-content',
      name: 'Copy visible open files content to clipboard (no links)',
      checkCallback: (checking) => {
        const visible_files = this.get_visible_open_files();
        if (!visible_files.size) return false;
        if (checking) return true;

        (async () => {
          // Build the "items{}" from each file path
          const items = {};
          for (const f of visible_files) {
            items[f.path] = true;
          }

          // Create a new SmartContext item within our SmartContexts collection
          const sc_item = this.env.smart_contexts.create_or_update({ items });

          // Compile the context
          const { context, stats } = await sc_item.compile({ link_depth: 0 });

          await this.copy_to_clipboard(context);
          this.showStatsNotice(stats, `${stats.item_count} visible file(s)`);
        })();

        return true;
      },
    });

    // Command: copy content from all open files
    this.addCommand({
      id: 'copy-all-open-files-content',
      name: 'Copy all open notes to clipboard (no links)',
      checkCallback: (checking) => {
        const all_files = this.get_all_open_files();
        if (!all_files.size) return false;
        if (checking) return true;

        (async () => {
          const items_obj = {};
          for (const f of all_files) {
            items_obj[f.path] = true;
          }

          const sc_item = await this.env.smart_contexts.create_or_update({
            items: items_obj,
            link_depth: 0,
          });

          const { context, stats } = await sc_item.compile();
          await this.copy_to_clipboard(context);
          this.showStatsNotice(stats, `${stats.item_count} open file(s)`);
        })();

        return true;
      },
    });

    // Command: copy content of visible open files (with linked)
    this.addCommand({
      id: 'copy-visible-open-files-content-with-linked',
      name: 'Copy visible notes to clipboard (with links)',
      checkCallback: (checking) => {
        const visible_files = this.get_visible_open_files();
        if (!visible_files.size) return false;
        if (checking) return true;

        (async () => {
          const items = {};
          let links = {};
          for (const f of visible_files) {
            items[f.path] = true;
            const codeblock_links = await this.parse_smart_context_codeblock(f);
            links = { ...links, ...codeblock_links };
          }
          const sc_item = await this.env.smart_contexts.create_or_update({ items });
          const { context, stats } = await sc_item.compile({ links });
          
          await this.copy_to_clipboard(context);
          this.showStatsNotice(
            stats,
            `${stats.item_count} file(s) total (visible + linked)`
          );
        })();

        return true;
      },
    });

    // Command: copy content of all open files (with linked files)
    this.addCommand({
      id: 'copy-all-open-files-content-with-linked',
      name: 'Copy all open files content to clipboard (with links)',
      checkCallback: (checking) => {
        const all_files_set = this.get_all_open_files();
        if (!all_files_set.size) return false;
        if (checking) return true;

        (async () => {
          // Build items{} from all open
          const items = {};
          let links = {};
          for (const f of all_files_set) {
            items[f.path] = true;
            const codeblock_links = await this.parse_smart_context_codeblock(f);
            links = { ...links, ...codeblock_links };
          }

          const sc_item = await this.env.smart_contexts.create_or_update({ items });
          const { context, stats } = await sc_item.compile({ links });

          await this.copy_to_clipboard(context);
          this.showStatsNotice(
            stats,
            `${stats.item_count} file(s) total (open + linked)`
          );
        })();

        return true;
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

    // Multiple file selection for building a custom context
    this.addCommand({
      id: 'open-context-select-modal',
      name: 'Build Context',
      callback: () => {
        const modal = new ContextSelectModal(this.app, this);
        modal.open();
      },
    });
  }

  /**
   * "File menu" right-click callback to copy folder contents.
   * Gathers text files, merges them, copies to clipboard.
   * @param {TFolder} folder
   * @param {boolean} include_subfolders
   */
  async copy_folder_contents(folder, include_subfolders = true) {
    const files = this.get_files_from_folder(folder, include_subfolders);
    if (!files.length) {
      new Notice('No recognized text files found in the selected folder.');
      return;
    }
    const folder_structure = this.generate_folder_structure(folder);

    const items = {};
    for (const f of files) {
      items[f.path] = true;
    }

    const sc_item = this.env.smart_contexts.create_or_update({ items });
    const { context, stats } = await sc_item.compile({ link_depth: 0 });

    const final_context = `${folder.name} folder structure:\n${folder_structure}\n\n${context}`;

    await this.copy_to_clipboard(final_context);
    this.showStatsNotice(stats, `${stats.item_count} file(s) in folder`);
  }

  /**
   * Gather all leaves in the workspace and pick only visible text files.
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
   * Gather all leaves in the workspace for any open text files.
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
   * Recursively gather leaves in the Obsidian workspace.
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
   * Is the leaf the active tab in its parent container?
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
   */
  get_files_from_folder(folder, include_subfolders) {
    const results = [];
    const vault_base = normalizePath(this.app.vault.adapter.basePath);
    const folder_abs_path = path.join(vault_base, folder.path);
    const ignore_patterns = load_ignore_patterns(folder_abs_path);

    const process_folder = (currentFolder) => {
      for (const child of currentFolder.children) {
        if (child instanceof TFolder) {
          if (include_subfolders) {
            process_folder(child);
          }
        } else {
          const rel = child.path;
          if (!should_ignore(rel, ignore_patterns) && is_text_file(rel)) {
            results.push(child);
          }
        }
      }
    };
    process_folder(folder);
    return results;
  }

  /**
   * Generate a tree representation of a folder.
   */
  generate_folder_structure(folder, prefix = '') {
    let structure = '';
    const children = folder.children.sort((a, b) => {
      if (a instanceof TFolder && b instanceof TFolder) return a.name.localeCompare(b.name);
      if (a instanceof TFolder && !(b instanceof TFolder)) return -1;
      if (!(a instanceof TFolder) && b instanceof TFolder) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const is_last = i === children.length - 1;
      const connector = is_last ? '└── ' : '├── ';

      if (child instanceof TFolder) {
        structure += `${prefix}${connector}${child.name}/\n`;
        structure += this.generate_folder_structure(child, prefix + '    ');
      } else {
        structure += `${prefix}${connector}${child.name}\n`;
      }
    }

    return structure;
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
  showStatsNotice(stats, filesMsg) {
    let noticeMsg = `Copied to clipboard! (${filesMsg})`;
    if (stats) {
      const char_count =
        stats.char_count < 100000
          ? stats.char_count
          : `~${Math.round(stats.char_count / 1000)}k`;
      noticeMsg += `, ${char_count} chars`;

      // If your code merges `exclusions` or similar, you can handle them here:
      // e.g. if (stats.exclusions) { ... }

      // The new "respect_exclusions" approach has a stats.exclusions map if used
      if (stats.exclusions) {
        const total_excluded = Object.values(stats.exclusions).reduce((p, c) => p + c, 0);
        if (total_excluded > 0) {
          noticeMsg += `, ${total_excluded} section(s) excluded`;
          // or format them similarly
        }
      }
    }
    new Notice(noticeMsg);
  }

  /**
   * Open the external file browser from the vault's parent folder (desktop only).
   */
  open_external_file_modal() {
    const vaultBasePath = normalizePath(this.app.vault.adapter.basePath);
    const parentFolder = path.dirname(vaultBasePath);
    const modal = new ExternalSelectModal(this.app, parentFolder, vaultBasePath);
    modal.open();
  }
  /**
   * Parse the active file's content to find lines in a ```smart-context``` codeblock.
   * @param {import("obsidian").TFile} file
   * @returns {Promise<Object>} links object to add to the opts for context.compile()
   */
  async parse_smart_context_codeblock(file) {
    const content = await this.app.vault.read(file);
    const lines = content.split('\n');

    let inside_sc_block = false;
    const sc_lines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('```smart-context')) {
        inside_sc_block = true;
        continue;
      }
      if (inside_sc_block && line.trim().startsWith('```')) {
        inside_sc_block = false;
        continue;
      }
      if (inside_sc_block) {
        if (line.trim()) {
          sc_lines.push(line.trim());
        }
      }
    }
    if(!sc_lines.length) return [];
    
    const paths = await this.gather_paths_respecting_scignore(sc_lines);

    const links = {};
    for(const path of paths){
      links[path] = {
        content: fs.readFileSync(path, 'utf8'),
        depth: [1],
        from: [file.path],
        type: 'OUTLINK-EXTERNAL',
      };
    }
    return links;
  }

  /**
   * Expand each line in a smart-context codeblock to actual file paths or directories,
   * while respecting .scignore/.gitignore patterns. Only includes recognized text files.
   * @param {string[]} sc_lines
   * @returns {Promise<string[]>}
   */
  async gather_paths_respecting_scignore(sc_lines) {
    const vault_base = normalizePath(this.app.vault.adapter.basePath);
    const results = new Set();

    for (const line of sc_lines) {
      const abs = path.join(vault_base, line);
      try {
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) {
          // gather all text files ignoring any .scignore/.gitignore
          const ignore_patterns = load_ignore_patterns(abs);
          const files_in_dir = this.gather_files_in_directory_sc(abs, ignore_patterns);
          for (const abs_path of files_in_dir) {
            results.add(abs_path);
          }
        } else {
          // single file
          if (is_text_file(abs)) {
            results.add(abs);
          }
        }
      } catch (err) {
        console.warn(`Skipping invalid path: ${line}`, err);
      }
    }

    return Array.from(results);
  }

  /**
   * Recursively gather recognized text files from `dirPath`,
   * ignoring patterns in ignore_patterns.
   * @param {string} dirPath
   * @param {string[]} ignore_patterns
   * @returns {string[]} array of absolute file paths
   */
  gather_files_in_directory_sc(dirPath, ignore_patterns) {
    const result = [];
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');

        // We check ignoring for multiple forms
        const localRelPath = path
          .relative(path.dirname(dirPath), fullPath)
          .replace(/\\/g, '/');
        if (
          should_ignore(fullPath, ignore_patterns) ||
          should_ignore(relPath, ignore_patterns) ||
          should_ignore(localRelPath, ignore_patterns)
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          result.push(...this.gather_files_in_directory_sc(fullPath, ignore_patterns));
        } else {
          if (is_text_file(fullPath)) {
            result.push(fullPath);
          }
        }
      }
    } catch (err) {
      console.warn('Error reading directory for smart-context:', dirPath, err);
    }
    return result;
  }
}

/**
 * A simple plugin settings tab that could delegate UI
 * to e.g. a SmartView-based settings or custom forms.
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
    this.env.smart_view.render_setting_components(containerEl, {scope: this.plugin.env.smart_contexts});
  }
}
