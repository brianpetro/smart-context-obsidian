import { Plugin, Notice, SuggestModal, TFile, TFolder, PluginSettingTab, Setting } from 'obsidian';
import { 
    strip_excluded_sections, 
    format_excluded_sections, 
    remove_included_link_lines, 
    inline_embedded_links 
} from './utils.js';

const DEFAULT_SETTINGS = {
  excluded_headings: [],
};

const WITH_LINKS_DEPTH = 1; // Only include direct links from initial files

export default class SmartContextPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addSettingTab(new SmartContextSettingTab(this.app, this));

    // Command to copy folder contents to clipboard (with folder structure and file contents)
    this.addCommand({
      id: 'copy-folder-contents',
      name: 'Copy folder contents to clipboard',
      callback: () => {
        new FolderSelectModal(this.app, async (folder) => {
          await this.copy_folder_contents(folder);
        }).open();
      },
    });

    // Command to copy the content of only currently visible open files
    this.addCommand({
      id: 'copy-visible-open-files-content',
      name: 'Copy visible open files content to clipboard',
      callback: async () => {
        await this.copy_visible_open_files_content();
      },
    });

    // Command to copy content from all open files to clipboard (visible or not)
    this.addCommand({
      id: 'copy-all-open-files-content',
      name: 'Copy all open files content to clipboard',
      callback: async () => {
        await this.copy_all_open_files_content();
      },
    });

    // Command to copy content of visible open files (with linked files)
    this.addCommand({
      id: 'copy-visible-open-files-content-with-linked',
      name: 'Copy visible open files content (with linked files) to clipboard',
      callback: async () => {
        const visible_files = this.get_visible_open_files();
        if (visible_files.size === 0) {
          new Notice('No visible Markdown or Canvas files found.');
          return;
        }
        await this.copy_files_with_linked_files(visible_files, 'Visible open files');
      },
    });

    // Command to copy content of all open files (with linked files)
    this.addCommand({
      id: 'copy-all-open-files-content-with-linked',
      name: 'Copy all open files content (with linked files) to clipboard',
      callback: async () => {
        const all_files = this.get_all_open_files();
        if (all_files.size === 0) {
          new Notice('No open Markdown or Canvas files found.');
          return;
        }
        await this.copy_files_with_linked_files(all_files, 'All open files');
      },
    });

    // Add a right-click context menu option on folders for copying folder contents
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item.setTitle('Copy folder contents to clipboard')
              .setIcon('documents')
              .onClick(async () => {
                await this.copy_folder_contents(file);
              });
          });
        }
      })
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Copy folder contents to clipboard.
   * @param {TFolder} folder 
   * @param {boolean} include_subfolders 
   * Format:
   * <folder_name> Folder Structure:
   * <folder_structure>
   * File Contents:
   * ----------------------
   * /<relative_file_path>
   * -----------------------
   * <file_content>
   * -----------------------
   */
  async copy_folder_contents(folder, include_subfolders = true) {
    const files = this.get_files_from_folder(folder, include_subfolders);
    const folder_name = folder.name;

    if (files.length === 0) {
      new Notice('No Markdown or Canvas files found in the selected folder.');
      return;
    }

    const folder_structure = this.generate_folder_structure(folder);
    let content_to_copy = `${folder_name} folder structure:\n${folder_structure}\nFile contents:\n`;

    let total_excluded_sections = 0;
    let all_excluded_sections = new Map();

    for (const file of files) {
      let file_content = await this.app.vault.read(file);
      const { processed_content, excluded_count, excluded_sections } = 
        strip_excluded_sections(file_content, this.settings.excluded_headings);
      
      total_excluded_sections += excluded_count;
      excluded_sections.forEach((count, section) => {
        all_excluded_sections.set(
          section, 
          (all_excluded_sections.get(section) || 0) + count
        );
      });

      const relative_file_path = this.get_relative_path(folder, file);
      content_to_copy += `----------------------\n/${relative_file_path}\n-----------------------\n${processed_content}\n-----------------------\n\n`;
    }

    try {
      await navigator.clipboard.writeText(content_to_copy);
      let noticeMsg = `Folder contents and structure copied to clipboard! (${files.length} files)`;
      if (total_excluded_sections > 0) {
        noticeMsg += `, ${total_excluded_sections} section(s) excluded${format_excluded_sections(all_excluded_sections)}`;
      }
      new Notice(noticeMsg);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      new Notice('Failed to copy folder contents to clipboard.');
    }
  }

  /**
   * Copy the content of only currently visible open files.
   * Format:
   * Open Files Contents:
   * ----------------------
   * /<file_path>
   * -----------------------
   * <file_content>
   * -----------------------
   */
  async copy_visible_open_files_content() {
    const visible_files = this.get_visible_open_files();
    if (visible_files.size === 0) {
      new Notice('No visible Markdown or Canvas files found.');
      return;
    }

    let content_to_copy = `Open files contents:\n`;
    let total_excluded_sections = 0;
    let all_excluded_sections = new Map();

    for (const file of visible_files) {
      let file_content = await this.app.vault.read(file);
      const { processed_content, excluded_count, excluded_sections } = 
        strip_excluded_sections(file_content, this.settings.excluded_headings);
      
      total_excluded_sections += excluded_count;
      excluded_sections.forEach((count, section) => {
        all_excluded_sections.set(
          section, 
          (all_excluded_sections.get(section) || 0) + count
        );
      });

      content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed_content}\n-----------------------\n\n`;
    }

    try {
      await navigator.clipboard.writeText(content_to_copy);
      let noticeMsg = `Visible open files content copied to clipboard! (${visible_files.size} files)`;
      if (total_excluded_sections > 0) {
        noticeMsg += `, ${total_excluded_sections} section(s) excluded${format_excluded_sections(all_excluded_sections)}`;
      }
      new Notice(noticeMsg);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      new Notice('Failed to copy visible open files content to clipboard.');
    }
  }

  /**
   * Copy content from all open files to clipboard (visible or not).
   * Format:
   * Open Files Contents:
   * ----------------------
   * /<file_path>
   * -----------------------
   * <file_content>
   * -----------------------
   */
  async copy_all_open_files_content() {
    const files_set = this.get_all_open_files();

    if (files_set.size === 0) {
      new Notice('No open Markdown or Canvas files found.');
      return;
    }

    let content_to_copy = `Open files contents:\n`;
    let total_excluded_sections = 0;
    let all_excluded_sections = new Map();

    for (const file of files_set) {
      let file_content = await this.app.vault.read(file);
      const { processed_content, excluded_count, excluded_sections } = 
        strip_excluded_sections(file_content, this.settings.excluded_headings);
      
      total_excluded_sections += excluded_count;
      excluded_sections.forEach((count, section) => {
        all_excluded_sections.set(
          section, 
          (all_excluded_sections.get(section) || 0) + count
        );
      });

      content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed_content}\n-----------------------\n\n`;
    }

    try {
      await navigator.clipboard.writeText(content_to_copy);
      let noticeMsg = `All open files content copied to clipboard! (${files_set.size} files)`;
      if (total_excluded_sections > 0) {
        noticeMsg += `, ${total_excluded_sections} section(s) excluded${format_excluded_sections(all_excluded_sections)}`;
      }
      new Notice(noticeMsg);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      new Notice('Failed to copy all open files content to clipboard.');
    }
  }

  /**
   * Copy content of files with their linked files to clipboard.
   * @param {Set<TFile>} initial_files - Initial set of files to process
   * @param {string} label - Label for the notice message
   */
  async copy_files_with_linked_files(initial_files, label) {
    const all_files = await this.get_all_linked_files_in_set(initial_files);
    const initial_file_paths = new Set(Array.from(initial_files).map(f => f.path));
    
    // First, collect all embedded files from initial files
    const embedded_files_map = new Map(); // Map<string, Set<string>> - file path to set of embedded file paths
    for (const file of initial_files) {
      const embedded_files = await this.get_embedded_links(file);
      embedded_files_map.set(file.path, new Set(Array.from(embedded_files).map(f => f.path)));
    }

    // Helper function to check if a file is embedded anywhere
    const is_file_embedded = (file_path) => {
      for (const embedded_set of embedded_files_map.values()) {
        if (embedded_set.has(file_path)) return true;
      }
      return false;
    };

    let content_to_copy = `${label} contents (with linked files):\n`;
    let total_excluded_sections = 0;
    let all_excluded_sections = new Map();

    // Process linked files first (that weren't in the initial set and aren't embedded)
    const linked_only_files = new Set(
      Array.from(all_files).filter(f => {
        if (initial_file_paths.has(f.path)) return false;
        if (is_file_embedded(f.path)) return false;
        return true;
      })
    );

    if (linked_only_files.size > 0) {
      content_to_copy += `Linked files:\n`;
      for (const file of linked_only_files) {
        let file_content = await this.app.vault.read(file);
        const { processed_content, excluded_count, excluded_sections } = 
          strip_excluded_sections(file_content, this.settings.excluded_headings);
        
        total_excluded_sections += excluded_count;
        excluded_sections.forEach((count, section) => {
          all_excluded_sections.set(
            section, 
            (all_excluded_sections.get(section) || 0) + count
          );
        });
        
        content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed_content}\n\n-----------------------\n\n`;
      }
    }

    // Then process initial files (visible/open files)
    content_to_copy += `\n${label}:\n`;
    for (const file of initial_files) {
      let file_content = await this.app.vault.read(file);

      // Create a resolver function for embedded links that checks against initial files
      const embedded_files = embedded_files_map.get(file.path) || new Set();
      const link_resolver = (linkText, currentPath) => {
        const linked_file = this.app.metadataCache.getFirstLinkpathDest(linkText, currentPath);
        return linked_file?.path;
      };
      const file_content_resolver = async (filePath) => {
        const tfile = this.app.vault.getAbstractFileByPath(filePath);
        if (tfile instanceof TFile) {
          return this.app.vault.read(tfile);
        }
        return '';
      };
      const embedded_links_resolver = (filePath) => {
        return embedded_files;
      };

      // Process embedded links
      file_content = await inline_embedded_links(
        file_content,
        file.path,
        link_resolver,
        file_content_resolver,
        this.settings.excluded_headings,
        embedded_links_resolver
      );

      // Remove lines that only contain links to included files or embedded files
      file_content = remove_included_link_lines(
        file_content,
        new Set([...initial_file_paths, ...Array.from(embedded_files)]),
        (linkText) => {
          const linked_file = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
          return linked_file?.path;
        }
      );

      const { processed_content, excluded_count, excluded_sections } = 
        strip_excluded_sections(file_content, this.settings.excluded_headings);
        
      total_excluded_sections += excluded_count;
      excluded_sections.forEach((count, section) => {
        all_excluded_sections.set(
          section, 
          (all_excluded_sections.get(section) || 0) + count
        );
      });

      content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed_content}\n`;
    }

    try {
      await navigator.clipboard.writeText(content_to_copy);
      let noticeMsg = `${label} content copied to clipboard! (${initial_files.size} files`;
      if (linked_only_files.size > 0) {
        noticeMsg += ` + ${linked_only_files.size} linked files`;
      }
      noticeMsg += ')';
      if (total_excluded_sections > 0) {
        noticeMsg += `, ${total_excluded_sections} section(s) excluded${format_excluded_sections(all_excluded_sections)}`;
      }
      new Notice(noticeMsg);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      new Notice('Failed to copy files content to clipboard.');
    }
  }

  /**
   * Strip excluded sections from file content.
   * Exclusions are now heading-level agnostic. The user specifies headings without '#'.
   * For example, "Secret". Any heading whose text (after # ) matches "Secret"
   * will start exclusion until the next heading of same or higher level.
   * Ignores headings in code blocks.
   *
   * @param {string} content
   * @param {string[]} excluded_headings - Array of heading strings (without #'s)
   * @returns {{processed_content: string, excluded_count: number, excluded_sections: Map<string, number>}}
   */
  strip_excluded_sections(content, excluded_headings) {
    if (!excluded_headings || excluded_headings.length === 0) {
      return { 
        processed_content: content, 
        excluded_count: 0,
        excluded_sections: new Map()
      };
    }

    const lines = content.split('\n');
    let result = [];
    let exclude_mode = false;
    let exclude_level = null;
    let excluded_count = 0;
    let in_code_block = false;
    let code_block_marker = '';
    // Track which sections were excluded and how many times
    let excluded_sections = new Map();
    let current_excluded_heading = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for code block markers
      const code_block_match = line.trim().match(/^(`{3,}|~{3,})/);
      if (code_block_match) {
        if (!in_code_block) {
          in_code_block = true;
          code_block_marker = code_block_match[1];
        } else if (line.trim().startsWith(code_block_marker)) {
          in_code_block = false;
          code_block_marker = '';
        }
        if (!exclude_mode) {
          result.push(line);
        }
        continue;
      }

      // If we're in a code block, include the line unless we're in exclude mode
      if (in_code_block) {
        if (!exclude_mode) {
          result.push(line);
        }
        continue;
      }

      // Check if line is a heading (only if not in code block)
      const heading_match = line.match(/^(#+)\s+(.*)$/);
      if (heading_match) {
        const hashes = heading_match[1];
        const heading_text = heading_match[2].trim();

        // Check if this heading should be excluded
        const excluded_heading = excluded_headings.find(h => h === heading_text);
        if (excluded_heading) {
          excluded_count++;
          current_excluded_heading = excluded_heading;
          excluded_sections.set(
            excluded_heading,
            (excluded_sections.get(excluded_heading) || 0) + 1
          );
          exclude_mode = true;
          exclude_level = hashes.length;
          continue;
        }

        // If we are currently excluding, check if this heading signals the end of exclusion
        if (exclude_mode) {
          const current_level = hashes.length;
          // If this heading is at the same or higher level (fewer or equal #),
          // we stop excluding.
          if (current_level <= exclude_level) {
            exclude_mode = false;
            exclude_level = null;
            current_excluded_heading = null;
            // This heading is outside excluded section, include it
            result.push(line);
          }
        } else {
          // Not excluding currently, just add line
          result.push(line);
        }
      } else {
        // Not a heading line
        if (!exclude_mode) {
          result.push(line);
        }
      }
    }

    return { 
      processed_content: result.join('\n'), 
      excluded_count,
      excluded_sections
    };
  }

  /**
   * Format excluded sections for notification
   * @param {Map<string, number>} excluded_sections
   * @returns {string}
   */
  format_excluded_sections(excluded_sections) {
    if (excluded_sections.size === 0) return '';
    
    const sections = Array.from(excluded_sections.entries())
      .map(([section, count]) => 
        count === 1 ? `  • "${section}"` : `  • "${section}" (${count}×)`
      )
      .join('\n');
    
    return `:\n${sections}`;
  }

  /**
   * Get all files from a folder.
   * @param {TFolder} folder 
   * @param {boolean} include_subfolders 
   * @returns {TFile[]}
   */
  get_files_from_folder(folder, include_subfolders) {
    const files = [];

    const process_folder = (current_folder) => {
      for (const child of current_folder.children) {
        if (child instanceof TFile && (child.extension === 'md' || child.extension === 'canvas')) {
          files.push(child);
        } else if (include_subfolders && child instanceof TFolder) {
          process_folder(child);
        }
      }
    };

    process_folder(folder);
    return files;
  }

  /**
   * Generate a folder structure string.
   * @param {TFolder} folder 
   * @param {string} prefix 
   * @returns {string}
   */
  generate_folder_structure(folder, prefix = '') {
    let structure = '';
    const children = folder.children.sort((a, b) => {
      // Folders first, then files
      if (a instanceof TFolder && b instanceof TFile) return -1;
      if (a instanceof TFile && b instanceof TFolder) return 1;
      // Alphabetical within same type
      return a.name.localeCompare(b.name);
    });

    for (const child of children) {
      if (child instanceof TFile && (child.extension === 'md' || child.extension === 'canvas')) {
        structure += `${prefix}└── ${child.name}\n`;
      } else if (child instanceof TFolder) {
        structure += `${prefix}└── ${child.name}/\n`;
        structure += this.generate_folder_structure(child, `${prefix}    `);
      }
    }

    return structure;
  }

  /**
   * Get the relative path of a file from a folder.
   * @param {TFolder} folder 
   * @param {TFile} file 
   * @returns {string}
   */
  get_relative_path(folder, file) {
    const folder_path = folder.path;
    const file_path = file.path;
    if (file_path.startsWith(folder_path)) {
      return file_path.slice(folder_path.length + 1);
    }
    return file_path;
  }

  /**
   * Get all leaves in the workspace.
   * @param {any} workspace 
   * @returns {any[]}
   */
  get_all_leaves(workspace) {
    const leaves = [];

    function recurse(container) {
      if (container.children) {
        for (const child of container.children) {
          recurse(child);
        }
      }
      if (container.type === 'leaf') {
        leaves.push(container);
      }
    }

    recurse(workspace.rootSplit);
    return leaves;
  }

  /**
   * Check if a leaf is visible.
   * @param {any} leaf 
   * @returns {boolean}
   */
  is_leaf_visible(leaf) {
    const parent = leaf.parent;
    if (!parent) {
      return leaf.containerEl && leaf.containerEl.offsetParent !== null;
    }

    // If parent has an activeTab attribute (e.g. a tabs container), check if this leaf is the active tab.
    if ('activeTab' in parent) {
      return parent.activeTab === leaf && leaf.containerEl && leaf.containerEl.offsetParent !== null;
    }

    return leaf.containerEl && leaf.containerEl.offsetParent !== null;
  }

  /**
   * Get all visible open files.
   * @returns {Set<TFile>}
   */
  get_visible_open_files() {
    const visible_files = new Set();
    const leaves = this.get_all_leaves(this.app.workspace);

    for (const leaf of leaves) {
      if (this.is_leaf_visible(leaf)) {
        const file = leaf.view?.file;
        if (file && (file.extension === 'md' || file.extension === 'canvas')) {
          visible_files.add(file);
        }
      }
    }

    return visible_files;
  }

  /**
   * Get all open files.
   * @returns {Set<TFile>}
   */
  get_all_open_files() {
    const files_set = new Set();
    const leaves = this.get_all_leaves(this.app.workspace);

    for (const leaf of leaves) {
      const file = leaf.view?.file;
      if (file && (file.extension === 'md' || file.extension === 'canvas')) {
        files_set.add(file);
      }
    }

    return files_set;
  }

  /**
   * Get all linked files in a set of files.
   * @param {Set<TFile>} initial_files 
   * @returns {Promise<Set<TFile>>}
   */
  async get_all_linked_files_in_set(initial_files) {
    const all_files = new Set(initial_files);
    const processed_files = new Set();
    const files_to_process = new Set(initial_files);

    while (files_to_process.size > 0) {
      const current_file = files_to_process.values().next().value;
      files_to_process.delete(current_file);
      processed_files.add(current_file);

      const linked_files = await this.get_all_linked_files(current_file);
      for (const linked_file of linked_files) {
        all_files.add(linked_file);
        if (!processed_files.has(linked_file)) {
          files_to_process.add(linked_file);
        }
      }
    }

    return all_files;
  }

  /**
   * Get all linked files from a file.
   * @param {TFile} file 
   * @returns {Promise<Set<TFile>>}
   */
  async get_all_linked_files(file) {
    const linked_files = new Set();
    const cache = this.app.metadataCache.getFileCache(file);

    if (!cache) {
      return linked_files;
    }

    // Process links
    if (cache.links) {
      for (const link of cache.links) {
        const linked_file = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
        if (linked_file && (linked_file.extension === 'md' || linked_file.extension === 'canvas')) {
          linked_files.add(linked_file);
        }
      }
    }

    // Process embeds
    if (cache.embeds) {
      for (const embed of cache.embeds) {
        const linked_file = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
        if (linked_file && (linked_file.extension === 'md' || linked_file.extension === 'canvas')) {
          linked_files.add(linked_file);
        }
      }
    }

    return linked_files;
  }

  /**
   * Get all embedded links from a file.
   * @param {TFile} file 
   * @returns {Promise<Set<TFile>>}
   */
  async get_embedded_links(file) {
    const embedded_files = new Set();
    const cache = this.app.metadataCache.getFileCache(file);

    if (!cache || !cache.embeds) {
      return embedded_files;
    }

    for (const embed of cache.embeds) {
      const linked_file = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
      if (linked_file && (linked_file.extension === 'md' || linked_file.extension === 'canvas')) {
        embedded_files.add(linked_file);
      }
    }

    return embedded_files;
  }
}

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
    return folders.filter(folder => 
      folder.path.toLowerCase().includes(query.toLowerCase())
    );
  }

  renderSuggestion(folder, el) {
    el.createEl('div', { text: folder.path });
  }

  onChooseSuggestion(folder, evt) {
    this.onChoose(folder);
  }
}

class SmartContextSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Excluded Headings')
      .setDesc('Headings to exclude from copied content (one per line)')
      .addTextArea(text => text
        .setPlaceholder('Enter headings to exclude')
        .setValue(this.plugin.settings.excluded_headings.join('\n'))
        .onChange(async (value) => {
          this.plugin.settings.excluded_headings = value.split('\n').map(s => s.trim()).filter(s => s);
          await this.plugin.saveSettings();
        }));
  }
}
