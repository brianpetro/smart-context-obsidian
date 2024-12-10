import { Plugin, Notice, SuggestModal, TFile, TFolder, PluginSettingTab, Setting } from 'obsidian';

const DEFAULT_SETTINGS = {
  excluded_headings: [],
};

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

    // If no files found
    if (files.length === 0) {
      new Notice('No Markdown or Canvas files found in the selected folder.');
      return;
    }

    // Generate folder structure
    const folder_structure = this.generate_folder_structure(folder);

    let content_to_copy = `${folder_name} folder structure:\n${folder_structure}\nFile contents:\n`;

    let total_excluded_sections = 0;
    for (const file of files) {
      let file_content = await this.app.vault.read(file);
      const { processed_content, excluded_count } = this.strip_excluded_sections(file_content, this.settings.excluded_headings);
      total_excluded_sections += excluded_count;

      const relative_file_path = this.get_relative_path(folder, file);
      content_to_copy += `----------------------\n/${relative_file_path}\n-----------------------\n${processed_content}\n-----------------------\n\n`;
    }

    try {
      await navigator.clipboard.writeText(content_to_copy);
      let noticeMsg = `Folder contents and structure copied to clipboard! (${files.length} files)`;
      if (total_excluded_sections > 0) {
        noticeMsg += `, ${total_excluded_sections} section(s) excluded`;
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

    for (const file of visible_files) {
      let file_content = await this.app.vault.read(file);
      const { processed_content, excluded_count } = this.strip_excluded_sections(file_content, this.settings.excluded_headings);
      total_excluded_sections += excluded_count;

      content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed_content}\n-----------------------\n\n`;
    }

    try {
      await navigator.clipboard.writeText(content_to_copy);
      let noticeMsg = `Visible open files content copied to clipboard! (${visible_files.size} files)`;
      if (total_excluded_sections > 0) {
        noticeMsg += `, ${total_excluded_sections} section(s) excluded`;
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

    for (const file of files_set) {
      let file_content = await this.app.vault.read(file);
      const { processed_content, excluded_count } = this.strip_excluded_sections(file_content, this.settings.excluded_headings);
      total_excluded_sections += excluded_count;

      content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed_content}\n-----------------------\n\n`;
    }

    try {
      await navigator.clipboard.writeText(content_to_copy);
      let noticeMsg = `All open files content copied to clipboard! (${files_set.size} files)`;
      if (total_excluded_sections > 0) {
        noticeMsg += `, ${total_excluded_sections} section(s) excluded`;
      }
      new Notice(noticeMsg);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      new Notice('Failed to copy all open files content to clipboard.');
    }
  }

  /**
   * Copy initial files plus all linked files to clipboard.
   * @param {Set<TFile>} initial_files
   * @param {string} label - A label for the notice ("Visible Open Files" or "All Open Files")
   */
  async copy_files_with_linked_files(initial_files, label) {
    // Gather all linked files recursively
    const all_files = await this.get_all_linked_files_in_set(initial_files);

    if (all_files.size === 0) {
      new Notice(`No files found to copy.`);
      return;
    }

    let content_to_copy = `${label} contents (including linked files):\n`;
    let total_excluded_sections = 0;

    for (const file of all_files) {
      let file_content = await this.app.vault.read(file);
      const { processed_content, excluded_count } = this.strip_excluded_sections(file_content, this.settings.excluded_headings);
      total_excluded_sections += excluded_count;

      content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed_content}\n-----------------------\n\n`;
    }

    try {
      await navigator.clipboard.writeText(content_to_copy);
      let noticeMsg = `${label} content (with linked files) copied to clipboard! (${all_files.size} files)`;
      if (total_excluded_sections > 0) {
        noticeMsg += `, ${total_excluded_sections} section(s) excluded`;
      }
      new Notice(noticeMsg);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      new Notice(`Failed to copy ${label.toLowerCase()} content with linked files to clipboard.`);
    }
  }

  /**
   * Get all linked files in a set of files.
   * @param {Set<TFile>} initial_files
   * @returns {Promise<Set<TFile>>}
   */
  async get_all_linked_files_in_set(initial_files) {
    const visited = new Set();
    const queue = [...initial_files];

    for (const f of initial_files) {
      visited.add(f.path);
    }

    // BFS or DFS to gather all linked files
    while (queue.length > 0) {
      const current_file = queue.shift();
      const linked_files = await this.get_all_linked_files(current_file);
      for (const lf of linked_files) {
        if (!visited.has(lf.path)) {
          visited.add(lf.path);
          queue.push(lf);
        }
      }
    }

    // Convert visited paths back to files
    const all_files = new Set();
    for (const path of visited) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile && ['md', 'canvas'].includes(file.extension)) {
        all_files.add(file);
      }
    }

    return all_files;
  }

  /**
   * Extract all linked files from a file's content.
   * Supports wiki-links of the form [[Note Name]] or [[Folder/Note Name]].
   * @param {TFile} file
   * @returns {Promise<Set<TFile>>}
   */
  async get_all_linked_files(file) {
    const links = new Set();
    const content = await this.app.vault.read(file);

    // Regex to match wiki-links: [[some link]]
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const linkText = match[1].trim();

      // Resolve the link to a file in the vault
      const linked_file = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
      if (linked_file && linked_file instanceof TFile && ['md', 'canvas'].includes(linked_file.extension)) {
        links.add(linked_file);
      }
    }

    return links;
  }

  /**
   * Strip excluded sections from file content.
   * Exclusions are now heading-level agnostic. The user specifies headings without '#'.
   * For example, "Secret". Any heading whose text (after # ) matches "Secret"
   * will start exclusion until the next heading of same or higher level.
   *
   * @param {string} content
   * @param {string[]} excluded_headings - Array of heading strings (without #'s)
   * @returns {{processed_content: string, excluded_count: number}}
   */
  strip_excluded_sections(content, excluded_headings) {
    if (!excluded_headings || excluded_headings.length === 0) return { processed_content: content, excluded_count: 0 };

    const lines = content.split('\n');
    let result = [];
    let exclude_mode = false;
    let exclude_level = null;
    let excluded_count = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if line is a heading
      const heading_match = line.match(/^(#+)\s+(.*)$/);
      if (heading_match) {
        const hashes = heading_match[1]; // string of '#'
        const heading_text = heading_match[2].trim(); // The actual heading text without '# '

        // If we encounter a heading line
        // Check if we should start excluding
        if (excluded_headings.includes(heading_text)) {
          // If we were not already excluding, increment excluded_count
          if (!exclude_mode) {
            excluded_count++;
          }
          // Start exclusion mode
          exclude_mode = true;
          exclude_level = hashes.length; // The level of this heading
          continue;
        } else {
          // If we are currently excluding, check if this heading signals the end of exclusion
          if (exclude_mode) {
            const current_level = hashes.length;
            // If this heading is at the same or higher level (fewer or equal #),
            // we stop excluding.
            if (current_level <= exclude_level) {
              exclude_mode = false;
              exclude_level = null;
              // This heading is outside excluded section, include it
              result.push(line);
            } else {
              // Still deeper, continue excluding
              continue;
            }
          } else {
            // Not excluding currently, just add line
            result.push(line);
          }
        }
      } else {
        // Not a heading line
        if (!exclude_mode) {
          result.push(line);
        }
      }
    }

    return { processed_content: result.join('\n'), excluded_count };
  }

  /**
   * Retrieve files from a folder.
   * @param {TFolder} folder - The folder to retrieve files from
   * @param {boolean} include_subfolders - Whether to include files from subfolders
   * @returns {Array<TFile>} Array of files (Markdown or Canvas)
   */
  get_files_from_folder(folder, include_subfolders) {
    let files = [];

    const process_folder = (current_folder) => {
      current_folder.children.forEach((child) => {
        if (child instanceof TFile && ['md', 'canvas'].includes(child.extension)) {
          files.push(child);
        } else if (include_subfolders && child instanceof TFolder) {
          process_folder(child);
        }
      });
    };

    process_folder(folder);
    return files;
  }

  /**
   * Generate a folder structure in a tree-like format.
   * @param {TFolder} folder
   * @param {string} prefix
   * @returns {string} The ASCII tree structure of the folder and its contents
   */
  generate_folder_structure(folder, prefix = '') {
    const children = folder.children.slice().sort((a, b) => {
      const aFolder = a instanceof TFolder;
      const bFolder = b instanceof TFolder;
      if (aFolder && !bFolder) return -1;
      if (!aFolder && bFolder) return 1;
      return a.name.localeCompare(b.name);
    });

    let structure = '';
    children.forEach((child, index) => {
      const is_last = index === children.length - 1;
      const connector = is_last ? '└── ' : '├── ';
      structure += `${prefix}${connector}${child.name}\n`;

      if (child instanceof TFolder) {
        structure += this.generate_folder_structure(child, prefix + (is_last ? '    ' : '│   '));
      }
    });
    return structure;
  }

  /**
   * Get relative path of a file relative to a folder
   * @param {TFolder} folder
   * @param {TFile} file
   * @returns {string}
   */
  get_relative_path(folder, file) {
    if (file.path.startsWith(folder.path + '/')) {
      return file.path.slice(folder.path.length + 1);
    } else {
      return file.path;
    }
  }

  /**
   * Recursively retrieve all leaves in the workspace.
   * @param {Workspace} workspace - The Obsidian workspace
   * @returns {Array<Leaf>} Array of leaves
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
   * Determine if a leaf is visible.
   * A leaf is considered visible if:
   * - It is inside a WorkspaceTabs container and is the activeTab.
   * - OR, if it's not inside WorkspaceTabs, and leaf.containerEl is visible in the DOM (offsetParent not null).
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
   * Get the set of visible open files.
   */
  get_visible_open_files() {
    const visible_files = new Set();
    const all_leaves = this.get_all_leaves(this.app.workspace);

    for (const leaf of all_leaves) {
      if (this.is_leaf_visible(leaf)) {
        const file = leaf.view?.file;
        if (file instanceof TFile && ['md', 'canvas'].includes(file.extension)) {
          visible_files.add(file);
        }
      }
    }
    return visible_files;
  }

  /**
   * Get the set of all open files (visible or not).
   */
  get_all_open_files() {
    const files_set = new Set();
    const all_leaves = this.get_all_leaves(this.app.workspace);

    for (const leaf of all_leaves) {
      const file = leaf.view?.file;
      if (file instanceof TFile && ['md', 'canvas'].includes(file.extension)) {
        files_set.add(file);
      }
    }
    return files_set;
  }
}

class FolderSelectModal extends SuggestModal {
  /**
   * @param {App} app 
   * @param {(folder:TFolder) => void} onChoose 
   */
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.allFolders = [];
    this.getAllFolders(this.app.vault.getRoot(), this.allFolders);
  }

  /**
   * Recursively collect all folders starting from root.
   * @param {TFolder} rootFolder 
   * @param {Array<TFolder>} folders 
   */
  getAllFolders(rootFolder, folders) {
    folders.push(rootFolder);
    for (const child of rootFolder.children) {
      if (child instanceof TFolder) {
        this.getAllFolders(child, folders);
      }
    }
  }

  /**
   * Get suggestions based on user query.
   * @param {string} query 
   * @returns {Array<TFolder>}
   */
  getSuggestions(query) {
    const lowerCaseQuery = query.toLowerCase();
    return this.allFolders.filter((folder) =>
      folder.path.toLowerCase().includes(lowerCaseQuery)
    );
  }

  /**
   * Render each suggestion in the modal.
   * @param {TFolder} folder 
   * @param {HTMLElement} el 
   */
  renderSuggestion(folder, el) {
    el.createEl('div', { text: folder.path });
  }

  /**
   * Handle the selection of a suggestion.
   * @param {TFolder} folder 
   * @param {MouseEvent | KeyboardEvent} evt 
   */
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
      .setName('Excluded headings')
      .setDesc('Headings to exclude when copying sections. Do not include "#" characters. Separate multiple headings by commas or new lines.')
      .addTextArea(text => {
        text
          .setPlaceholder('Secret\nDraft\nOld Section')
          .setValue(this.plugin.settings.excluded_headings.join('\n'))
          .onChange(async (value) => {
            // Parse the value by splitting on newlines or commas
            let headings = value.split(/\r?\n|,/)
              .map(h => h.trim())
              .filter(h => h.length > 0);

            this.plugin.settings.excluded_headings = headings;
            await this.plugin.saveSettings();
          });
      });
  }
}
