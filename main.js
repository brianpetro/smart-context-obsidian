import { Plugin, Notice, SuggestModal, TFile, TFolder } from 'obsidian';

export default class SmartContextPlugin extends Plugin {
  async onload() {
    console.log('Loading Smart Context Plugin');

    // Command to copy folder contents to clipboard (with folder structure and file contents)
    this.addCommand({
      id: 'copy-folder-contents',
      name: 'Copy Folder Contents to Clipboard',
      callback: () => {
        new FolderSelectModal(this.app, async (folder) => {
          await this.copy_folder_contents(folder);
        }).open();
      },
    });

    // Command to copy the content of only currently visible open files
    this.addCommand({
      id: 'copy-visible-open-files-content',
      name: 'Copy Visible Open Files Content to Clipboard',
      callback: async () => {
        await this.copy_visible_open_files_content();
      },
    });

    // Command to copy content from all open files to clipboard (visible or not)
    this.addCommand({
      id: 'copy-all-open-files-content',
      name: 'Copy All Open Files Content to Clipboard',
      callback: async () => {
        await this.copy_all_open_files_content();
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

    let content_to_copy = `${folder_name} Folder Structure:\n${folder_structure}\nFile Contents:\n`;

    // Add each file in the desired format
    for (const file of files) {
      const file_content = await this.app.vault.read(file);
      const relative_file_path = this.get_relative_path(folder, file);
      content_to_copy += `----------------------\n/${relative_file_path}\n-----------------------\n${file_content}\n-----------------------\n\n`;
    }

    try {
      await navigator.clipboard.writeText(content_to_copy);
      new Notice(`Folder contents and structure copied to clipboard! (${files.length} files)`);
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

    if (visible_files.size === 0) {
      new Notice('No visible Markdown or Canvas files found.');
      return;
    }

    let content_to_copy = `Open Files Contents:\n`;

    for (const file of visible_files) {
      const file_content = await this.app.vault.read(file);
      // file.path is relative to vault root
      content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${file_content}\n-----------------------\n\n`;
    }

    try {
      await navigator.clipboard.writeText(content_to_copy);
      new Notice(`Visible open files content copied to clipboard! (${visible_files.size} files)`);
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
    const files_set = new Set();
    const all_leaves = this.get_all_leaves(this.app.workspace);

    for (const leaf of all_leaves) {
      const file = leaf.view?.file;
      if (file instanceof TFile && ['md', 'canvas'].includes(file.extension)) {
        files_set.add(file);
      }
    }

    if (files_set.size === 0) {
      new Notice('No open Markdown or Canvas files found.');
      return;
    }

    let content_to_copy = `Open Files Contents:\n`;

    for (const file of files_set) {
      const file_content = await this.app.vault.read(file);
      content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${file_content}\n-----------------------\n\n`;
    }

    try {
      await navigator.clipboard.writeText(content_to_copy);
      new Notice(`All open files content copied to clipboard! (${files_set.size} files)`);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      new Notice('Failed to copy all open files content to clipboard.');
    }
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
   * Similar to the VSCode plugin approach, but using Obsidian's TFolder and TFile.
   *
   * @param {TFolder} folder
   * @param {string} prefix
   * @returns {string} The ASCII tree structure of the folder and its contents
   */
  generate_folder_structure(folder, prefix = '') {
    // Sort children by type: folders first, then files, for consistent structure
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
    // folder.path and file.path are relative to vault root
    // To get relative path from folder to file, we can remove the folder.path prefix
    if (file.path.startsWith(folder.path + '/')) {
      return file.path.slice(folder.path.length + 1);
    } else {
      // If file is not under folder (shouldn't happen), just return file.path
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
      // If no parent, just check offsetParent to ensure it's displayed
      return leaf.containerEl && leaf.containerEl.offsetParent !== null;
    }

    if ('activeTab' in parent) {
      // parent is WorkspaceTabs
      return parent.activeTab === leaf && leaf.containerEl && leaf.containerEl.offsetParent !== null;
    }

    // If not WorkspaceTabs (likely a WorkspaceSplit), check DOM visibility
    return leaf.containerEl && leaf.containerEl.offsetParent !== null;
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
    this.get_all_folders(this.app.vault.getRoot(), this.allFolders);
  }

  /**
   * Recursively collect all folders starting from root.
   * @param {TFolder} rootFolder 
   * @param {Array<TFolder>} folders 
   */
  get_all_folders(rootFolder, folders) {
    folders.push(rootFolder);
    for (const child of rootFolder.children) {
      if (child instanceof TFolder) {
        this.get_all_folders(child, folders);
      }
    }
  }

  /**
   * Get suggestions based on user query.
   * @param {string} query 
   * @returns {Array<TFolder>}
   */
  get_suggestions(query) {
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
  render_suggestion(folder, el) {
    el.createEl('div', { text: folder.path });
  }

  /**
   * Handle the selection of a suggestion.
   * @param {TFolder} folder 
   * @param {MouseEvent | KeyboardEvent} evt 
   */
  on_choose_suggestion(folder, evt) {
    this.onChoose(folder);
  }
}
