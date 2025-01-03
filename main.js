import {
  Plugin,
  Notice,
  SuggestModal,
  TFolder,
  PluginSettingTab,
  normalizePath,
} from 'obsidian';
import { SmartFs } from 'smart-file-system/smart_fs.js';
import { SmartFsObsidianAdapter } from 'smart-file-system/adapters/obsidian.js';
import { SmartContext } from './smart-context/smart_context.js';
import { SmartView } from 'smart-view';
import { SmartViewObsidianAdapter } from 'smart-view/adapters/obsidian.js';
import { SmartSettings } from 'smart-settings';
import { format_excluded_sections } from './smart-context/utils.js';
import fs from 'fs';
import path from 'path';
import { ExternalSelectModal } from './external_select_modal.js';

import {
  load_ignore_patterns,
  should_ignore,
  is_text_file
} from 'smart-file-system/utils/ignore.js';

/**
 * Default settings pulled into the plugin if not overridden by the user.
 */
const DEFAULT_SETTINGS = {
  excluded_headings: [],
  before_prompt: '',
  before_each_prompt: '',
  after_each_prompt: '',
  after_prompt: '',
  link_depth: 1,
  include_file_tree: true,
  max_linked_files: 0, // 0 means "no limit" by default
};

export default class SmartContextPlugin extends Plugin {
  async onload() {
    console.log('Loading SmartContextPlugin...');

    // 1) Use SmartSettings to load existing plugin settings
    await SmartSettings.create(this, {
      load: async () => {
        const loadedData = await this.loadData();
        return Object.assign({}, DEFAULT_SETTINGS, loadedData);
      },
      save: async (settings) => {
        await this.saveData(settings);
      },
    });

    // 2) Setup a SmartFs instance
    this.smart_fs = new SmartFs(
      { main: this },
      {
        adapter: SmartFsObsidianAdapter,
        fs_path: '',
        exclude_patterns: [],
      }
    );

    // 3) Create the SmartContext instance
    this.smartContext = new SmartContext({
      fs: this.smart_fs,
      settings: this.settings, // plugin’s settings object
    });

    // 4) Register plugin commands

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
      name: 'Copy visible open files content to clipboard',
      checkCallback: (checking) => {
        const visible_files = this.get_visible_open_files();
        if (!visible_files.size) return false;
        if (checking) return true;

        (async () => {
          const { context, stats } = await this.smartContext.build_context({
            mode: 'visible',
            label: 'Open files contents',
            files: Array.from(visible_files).map((f) => ({ path: f.path })),
            link_depth: this.settings.link_depth,
          });
          await this.copy_to_clipboard(context);
          this.showStatsNotice(stats, `${stats.file_count} visible file(s)`);
        })();

        return true;
      },
    });

    // Command: copy content from all open files
    this.addCommand({
      id: 'copy-all-open-files-content',
      name: 'Copy all open files content to clipboard',
      checkCallback: (checking) => {
        const all_files = this.get_all_open_files();
        if (!all_files.size) return false;
        if (checking) return true;

        (async () => {
          const { context, stats } = await this.smartContext.build_context({
            mode: 'all-open',
            label: 'Open files contents',
            files: Array.from(all_files).map((f) => ({ path: f.path })),
            link_depth: this.settings.link_depth,
          });
          await this.copy_to_clipboard(context);
          this.showStatsNotice(stats, `${stats.file_count} open file(s)`);
        })();

        return true;
      },
    });

    // Command: copy content of visible open files (with linked)
    this.addCommand({
      id: 'copy-visible-open-files-content-with-linked',
      name: 'Copy visible open files content (with linked files) to clipboard',
      checkCallback: (checking) => {
        const visible_files = this.get_visible_open_files();
        if (!visible_files.size) return false;
        if (checking) return true;

        (async () => {
          const { context, stats } = await this.smartContext.build_context({
            mode: 'visible-linked',
            label: 'Visible open files',
            initial_files: Array.from(visible_files).map((f) => ({
              path: f.path,
            })),
            all_files: await this.get_linked_files(
              visible_files,
              this.settings.link_depth
            ),
            active_file_path: this.app.workspace.getActiveFile()?.path ?? '',
          });
          await this.copy_to_clipboard(context);
          this.showStatsNotice(
            stats,
            `${stats.file_count} file(s) total (visible + linked)`
          );
        })();

        return true;
      },
    });

    // Command: copy content of all open files (with linked files)
    this.addCommand({
      id: 'copy-all-open-files-content-with-linked',
      name: 'Copy all open files content (with linked files) to clipboard',
      checkCallback: (checking) => {
        const all_files_set = this.get_all_open_files();
        if (!all_files_set.size) return false;
        if (checking) return true;

        (async () => {
          const { context, stats } = await this.smartContext.build_context({
            mode: 'all-open-linked',
            label: 'All open files',
            initial_files: Array.from(all_files_set).map((f) => ({
              path: f.path,
            })),
            all_files: await this.get_linked_files(
              all_files_set,
              this.settings.link_depth
            ),
            active_file_path: this.app.workspace.getActiveFile()?.path ?? '',
          });
          await this.copy_to_clipboard(context);
          this.showStatsNotice(
            stats,
            `${stats.file_count} file(s) total (open + linked)`
          );
        })();

        return true;
      },
    });

    // NEW COMMAND: open external file modal (improved)
    this.addCommand({
      id: 'open-external-file-browser',
      name: 'Open External File Browser',
      checkCallback: (checking) => {
        // Only allow on desktop
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

    // Add a right-click context menu option on folders
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

    // 5) Add plugin settings tab
    this.addSettingTab(new SmartContextSettingTab(this.app, this));
  }

  /**
   * Open our ExternalFileModal with the folder containing the vault as initial scope.
   */
  open_external_file_modal() {
    // The Obsidian vault directory path
    const vaultBasePath = normalizePath(this.app.vault.adapter.basePath);
    // The folder containing the vault
    const parentFolder = path.dirname(vaultBasePath);

    const modal = new ExternalSelectModal(this.app, parentFolder, vaultBasePath);
    modal.open();
  }

  onunload() {
    console.log('Unloading SmartContextPlugin...');
  }

  /**
   * Copy folder contents (optionally including subfolders).
   * We gather only "text files" (via is_text_file) from the folder, ignoring any that match
   * .gitignore/.scignore patterns.
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
    const { context, stats } = await this.smartContext.build_context({
      mode: 'folder',
      label: folder.name + ' folder structure',
      folder_structure,
      files: files.map((f) => ({ path: f.path })),
    });
    await this.copy_to_clipboard(context);
    this.showStatsNotice(stats, `${stats.file_count} file(s) in folder`);
  }

  /**
   * Generate a user-facing notice summarizing how many files were copied and sections excluded.
   */
  showStatsNotice(stats, filesMsg) {
    let noticeMsg = `Copied to clipboard! (${filesMsg})`;
    const char_count = stats.char_count < 100000
      ? stats.char_count
      : `~${Math.round(stats.char_count / 1000)}k`;
    noticeMsg += `, ${char_count} chars`;
    if (stats.total_excluded_sections > 0) {
      noticeMsg += `, ${stats.total_excluded_sections} section(s) excluded`;
      const formatted = format_excluded_sections(stats.excluded_sections_map);
      if (formatted) {
        noticeMsg += formatted;
      }
    }
    new Notice(noticeMsg);
  }

  /**
   * Gather all leaves in the workspace and pick only visible text files.
   * (We rely on is_text_file to determine if it’s “text.”)
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
   * Gather all leaves in the workspace for *any* open text files.
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
   * Determine if a leaf is the active tab in a parent container (and thus "visible").
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
   * Respects .gitignore and .scignore patterns using is_text_file + should_ignore.
   * @param {TFolder} folder
   * @param {boolean} include_subfolders
   * @returns {TFile[]}
   */
  get_files_from_folder(folder, include_subfolders) {
    const results = [];
    const vault_base = normalizePath(this.app.vault.adapter.basePath);

    // Load ignore patterns from this folder up to the root
    const ignore_patterns = load_ignore_patterns(path.join(vault_base, folder.path));

    const process_folder = (currentFolder) => {
      for (const child of currentFolder.children) {
        if (child instanceof TFolder) {
          if (include_subfolders) {
            process_folder(child);
          }
        } else {
          // Check if we skip it
          const rel = child.path; // relative to the vault root
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
   * Generate a textual folder tree structure for display/clipboard.
   * Note: We do not do ignoring here since default plugin code enumerates everything,
   * but you can unify if desired.
   */
  generate_folder_structure(folder, prefix = '') {
    let structure = '';
    const children = folder.children.sort((a, b) => {
      // Folders first, then files
      if (a instanceof TFolder && b instanceof TFolder)
        return a.name.localeCompare(b.name);
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
   * Recursively gather all transitive linked files up to `link_depth` hops.
   * Also respects `max_linked_files` if > 0.
   *
   * @param {Set<TFile>} initialFiles
   * @param {number} link_depth
   * @returns {Promise<{path: string}[]>}
   */
  async get_linked_files(initialFiles, link_depth) {
    if (!link_depth || link_depth < 1) {
      return Array.from(initialFiles).map((f) => ({ path: f.path }));
    }
    const all = new Map();
    for (const f of initialFiles) {
      all.set(f.path, f);
    }
    const queue = [...initialFiles].map((f) => ({ file: f, depth: 0 }));

    const max_files = this.settings.max_linked_files || 0; // 0 means no limit

    while (queue.length) {
      if (max_files > 0 && all.size >= max_files) break;

      const { file, depth } = queue.shift();
      if (depth >= link_depth) continue;
      const links = await this.get_all_linked_files(file);
      for (const lf of links) {
        if (max_files > 0 && all.size >= max_files) break;
        if (!all.has(lf.path)) {
          all.set(lf.path, lf);
          queue.push({ file: lf, depth: depth + 1 });
        }
      }
    }
    return Array.from(all.values()).map((f) => ({ path: f.path }));
  }

  /**
   * Return any directly linked files for a given TFile (both [[links]] and ![[embeds]]).
   * @param {TFile} file
   * @returns {Promise<Set<TFile>>}
   */
  async get_all_linked_files(file) {
    const result = new Set();
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return result;

    // normal [[links]]
    if (cache.links) {
      for (const link of cache.links) {
        const linked_file = this.app.metadataCache.getFirstLinkpathDest(
          link.link,
          file.path
        );
        if (linked_file && is_text_file(linked_file.path)) {
          result.add(linked_file);
        }
      }
    }

    // ![[embeds]]
    if (cache.embeds) {
      for (const embed of cache.embeds) {
        const linked_file = this.app.metadataCache.getFirstLinkpathDest(
          embed.link,
          file.path
        );
        if (linked_file && is_text_file(linked_file.path)) {
          result.add(linked_file);
        }
      }
    }
    return result;
  }

  /**
   * Copy text to the user clipboard, also checking if there's a ```smart-context``` codeblock
   * in the active file. If present, parse its lines as paths (or directories) and merge those
   * files into the final context we copy.
   *
   * @param {string} text
   */
  async copy_to_clipboard(text) {
    try {
      const active_file = this.app.workspace.getActiveFile();
      if (active_file) {
        // Check if there's a codeblock for smart-context
        const sc_lines = await this.parse_smart_context_codeblock(active_file);
        if (sc_lines && sc_lines.length) {
          // Expand lines: if a line is a directory, gather all text files respecting .scignore/.gitignore
          const paths_to_copy = await this.gather_paths_respecting_scignore(sc_lines);

          if (paths_to_copy.length) {
            // We'll build context from these codeblock paths
            const { context, stats } = await this.smartContext.build_context({
              mode: 'folder', // reusing "folder" style so it says "File contents:"
              label: 'Paths from smart-context',
              files: paths_to_copy.map((p) => ({ path: p })),
            });

            // Show a notice about the codeblock expansions
            this.showStatsNotice(stats, `${stats.file_count} file(s) from codeblock`);

            // Merge that new context with the provided text param
            text = context + '\n\n' + text;
          }
        }
      }

      // Now we do the actual copy
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for Electron (desktop)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { clipboard } = require('electron');
        clipboard.writeText(text);
      }
    } catch (err) {
      console.error('Failed to copy text:', err);
      new Notice('Failed to copy.');
    }
  }

  /**
   * Parse the active file's content to find lines in a ```smart-context``` codeblock.
   * Returns an array of strings (one per line inside the code block).
   * @param {import("obsidian").TFile} file
   * @returns {Promise<string[]>}
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

    return sc_lines;
  }

  /**
   * Expand each line in a smart-context codeblock to actual file paths or directories,
   * while respecting .scignore/.gitignore patterns. Only includes recognized text files.
   * @param {string[]} sc_lines
   * @returns {Promise<string[]>} an array of vault-relative paths
   */
  async gather_paths_respecting_scignore(sc_lines) {
    const vault_base = normalizePath(this.app.vault.adapter.basePath);
    const results = new Set();

    for (const line of sc_lines) {
      const abs = path.join(vault_base, line);
      try {
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) {
          // gather all text files ignoring any .scignore/.gitignore patterns
          const ignore_patterns = load_ignore_patterns(abs);
          const files_in_dir = this.gather_files_in_directory_sc(abs, ignore_patterns);
          for (const f of files_in_dir) {
            const rel = path.relative(vault_base, f).replace(/\\/g, '/');
            results.add(rel);
          }
        } else {
          // single file
          if (is_text_file(abs)) {
            const rel = path.relative(vault_base, abs).replace(/\\/g, '/');
            results.add(rel);
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

        // Check ignoring
        // We want a relative path from the folder’s root up to the file, so let's do:
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
 * A simple settings tab that delegates most UI to SmartView (if desired).
 */
class SmartContextSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.smartView = new SmartView({ adapter: SmartViewObsidianAdapter });
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    // Merge plugin’s SmartContext settings_config
    const config = this.plugin.smartContext.settings_config;

    this.smartView
      .render_settings(config, { scope: this.plugin })
      .then((frag) => {
        containerEl.appendChild(frag);
      });
  }
}

/**
 * Modal that lists all folders for the user to pick from.
 */
class FolderSelectModal extends SuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
  }

  getAllFolders(rootFolder, folders = []) {
    folders.push(rootFolder);
    for (const child of rootFolder.children) {
      if (child instanceof TFolder) {
        this.getAllFolders(child, folders);
      }
    }
    return folders;
  }

  getSuggestions(query) {
    const folders = this.getAllFolders(this.app.vault.getRoot());
    return folders.filter((folder) =>
      folder.path.toLowerCase().includes(query.toLowerCase())
    );
  }

  renderSuggestion(folder, el) {
    el.createEl('div', { text: folder.path });
  }

  onChooseSuggestion(folder) {
    this.onChoose(folder);
  }
}
