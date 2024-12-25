import { Plugin, Notice, SuggestModal, TFolder, PluginSettingTab } from 'obsidian';
import { SmartFs } from 'smart-file-system/smart_fs.js';
import { SmartFsObsidianAdapter } from 'smart-file-system/adapters/obsidian.js';
import { SmartContext } from './smart-context/smart_context.js';
import { SmartView } from 'smart-view';
import { SmartViewObsidianAdapter } from 'smart-view/adapters/obsidian.js';
import { SmartSettings } from 'smart-settings';
import { format_excluded_sections } from './smart-context/utils.js';

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

    // Command: copy folder contents (optionally including subfolders).
    // This command always opens a modal first, so there's no direct
    // "pre-check" to skip. We can leave it as a normal callback.
    this.addCommand({
      id: 'copy-folder-contents',
      name: 'Copy folder contents to clipboard',
      callback: () => {
        new FolderSelectModal(this.app, async (folder) => {
          // If user cancelled or no folder, do nothing
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
        // If no visible files, disable in the command palette
        if (!visible_files.size) return false;

        // If checking==true, do not run yet; just say "yes, we can run it"
        if (checking) return true;

        // Otherwise, do the real action
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

    // Command: copy content from all open files (visible or not)
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

    // Command: copy content of visible open files (with linked files)
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
            initial_files: Array.from(visible_files).map((f) => ({ path: f.path })),
            all_files: await this.get_linked_files(visible_files, this.settings.link_depth),
            active_file_path: this.app.workspace.getActiveFile()?.path ?? '',
            link_depth: this.settings.link_depth,
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
            initial_files: Array.from(all_files_set).map((f) => ({ path: f.path })),
            all_files: await this.get_linked_files(all_files_set, this.settings.link_depth),
            active_file_path: this.app.workspace.getActiveFile()?.path ?? '',
            link_depth: this.settings.link_depth,
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

    // Add a right-click context menu option on folders for copying folder contents
    // (no pre-check needed: user specifically clicks the folder)
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

  onunload() {
    console.log('Unloading SmartContextPlugin...');
  }

  /**
   * Copy folder contents (optionally including subfolders).
   * @param {TFolder} folder
   * @param {boolean} include_subfolders
   */
  async copy_folder_contents(folder, include_subfolders = true) {
    const files = this.get_files_from_folder(folder, include_subfolders);
    if (!files.length) {
      new Notice('No Markdown or Canvas files found in the selected folder.');
      return;
    }
    const folder_structure = this.generate_folder_structure(folder);
    const { context, stats } = await this.smartContext.build_context({
      mode: 'folder',
      label: folder.name + ' folder structure',
      folder_structure,
      files: files.map((f) => ({ path: f.path })),
      link_depth: this.settings.link_depth,
    });
    await this.copy_to_clipboard(context);
    this.showStatsNotice(stats, `${stats.file_count} file(s) in folder`);
  }

  /**
   * Generate a user-facing notice summarizing how many files were copied and sections excluded.
   */
  showStatsNotice(stats, filesMsg) {
    let noticeMsg = `Copied to clipboard! (${filesMsg})`;
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
   * Gather all leaves in the workspace and pick only visible .md or .canvas files.
   */
  get_visible_open_files() {
    const leaves = this.get_all_leaves();
    const visible_files = new Set();
    for (const leaf of leaves) {
      if (!this.is_leaf_visible(leaf)) continue;
      const file = leaf.view?.file;
      if (file && (file.extension === 'md' || file.extension === 'canvas')) {
        visible_files.add(file);
      }
    }
    return visible_files;
  }

  /**
   * Gather all leaves in the workspace for *any* open .md/.canvas files.
   */
  get_all_open_files() {
    const leaves = this.get_all_leaves();
    const files_set = new Set();
    for (const leaf of leaves) {
      const file = leaf.view?.file;
      if (file && (file.extension === 'md' || file.extension === 'canvas')) {
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
      return parent.activeTab === leaf && leaf.containerEl && leaf.containerEl.offsetParent !== null;
    }
    return leaf.containerEl && leaf.containerEl.offsetParent !== null;
  }

  /**
   * Recursively gather .md/.canvas files from a folder (optionally subfolders).
   * @param {TFolder} folder
   * @param {boolean} include_subfolders
   * @returns {TFile[]}
   */
  get_files_from_folder(folder, include_subfolders) {
    const files = [];
    const processFolder = (currentFolder) => {
      for (const child of currentFolder.children) {
        if (child instanceof TFolder) {
          if (include_subfolders) processFolder(child);
        } else if (child.extension === 'md' || child.extension === 'canvas') {
          files.push(child);
        }
      }
    };
    processFolder(folder);
    return files;
  }

  /**
   * Generate a textual folder tree structure for display/clipboard.
   */
  generate_folder_structure(folder, prefix = '') {
    let structure = '';
    const children = folder.children.sort((a, b) => {
      // Folders first, then files
      if (a instanceof TFolder && b instanceof TFolder) return a.name.localeCompare(b.name);
      if (a instanceof TFolder && !(b instanceof TFolder)) return -1;
      if (!(a instanceof TFolder) && b instanceof TFolder) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const child of children) {
      if (child instanceof TFolder) {
        structure += `${prefix}└── ${child.name}/\n`;
        structure += this.generate_folder_structure(child, prefix + '    ');
      } else if (child.extension === 'md' || child.extension === 'canvas') {
        structure += `${prefix}└── ${child.name}\n`;
      }
    }
    return structure;
  }

  /**
   * Recursively gather all transitive linked files up to `link_depth` hops.
   * This effectively merges the original "get_all_linked_files_in_set" with a BFS limit.
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

    while (queue.length) {
      const { file, depth } = queue.shift();
      if (depth >= link_depth) continue;
      const links = await this.get_all_linked_files(file);
      for (const lf of links) {
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
        const linked_file = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
        if (linked_file && (linked_file.extension === 'md' || linked_file.extension === 'canvas')) {
          result.add(linked_file);
        }
      }
    }

    // ![[embeds]]
    if (cache.embeds) {
      for (const embed of cache.embeds) {
        const linked_file = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
        if (linked_file && (linked_file.extension === 'md' || linked_file.extension === 'canvas')) {
          result.add(linked_file);
        }
      }
    }
    return result;
  }

  /**
   * Copy text to the user clipboard, with an Electron fallback.
   * @param {string} text
   */
  async copy_to_clipboard(text) {
    try {
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

    this.smartView.render_settings(config, { scope: this.plugin }).then((frag) => {
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
