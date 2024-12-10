import { Plugin, Notice, SuggestModal, TFile, TFolder } from 'obsidian';

export default class SmartContextPlugin extends Plugin {
  async onload() {
    // Command to copy folder contents to clipboard
    this.addCommand({
      id: 'copy-folder-contents',
      name: 'Copy Folder Contents to Clipboard',
      callback: () => {
        new FolderSelectModal(this.app, async (folder) => {
          await this.copy_folder_contents(folder);
        }).open();
      },
    });

    // Command to copy the content of only currently visible tabs
    this.addCommand({
      id: 'copy-visible-open-file-content',
      name: 'Copy Visible Open File Content to Clipboard',
      callback: async () => {
        await this.copy_visible_open_file_content();
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
   * @param {TFolder} folder - The folder to copy
   * @param {boolean} [include_subfolders=true] - Whether to include subfolders
   */
  async copy_folder_contents(folder, include_subfolders = true) {
    const files = this.get_files_from_folder(folder, include_subfolders);

    if (files.length === 0) {
      new Notice('No Markdown or Canvas files found in the selected folder.');
      return;
    }

    const contents_array = await Promise.all(
      files.map(async (file) => {
        const file_content = await this.app.vault.read(file);
        return `---${file.path}---\n${file_content}\n\n`;
      })
    );

    const contents = contents_array.join('');

    try {
      await navigator.clipboard.writeText(contents);
      new Notice('Folder contents copied to clipboard.');
    } catch (err) {
      console.error('Failed to copy text: ', err);
      new Notice('Failed to copy folder contents to clipboard.');
    }
  }

  /**
   * Copy the content of only currently visible open files.
   * Visible means:
   * - If a pane has multiple tabs, only the active tab in that pane is visible.
   * - If multiple panes are side by side, all of those panes are visible.
   */
  async copy_visible_open_file_content() {
    const leaves = this.app.workspace.getLeaves();
    const visible_files = new Set();

    for (const leaf of leaves) {
      // Check if this leaf is visible:
      // If it's in a tab group (WorkspaceTabs), only copy if this leaf is the activeTab.
      // If it's directly in a split or otherwise, we consider it visible by default.
      const parent = leaf.parent;
      let is_visible = true;
      if (parent && 'activeTab' in parent) {
        // parent is a WorkspaceTabs-like container
        if (parent.activeTab !== leaf) {
          is_visible = false;
        }
      }

      if (is_visible) {
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

    const contents_array = await Promise.all(
      Array.from(visible_files).map(async (file) => {
        const file_content = await this.app.vault.read(file);
        return `---${file.path}---\n${file_content}\n\n`;
      })
    );

    const contents = contents_array.join('');

    try {
      await navigator.clipboard.writeText(contents);
      new Notice('Visible open file content copied to clipboard.');
    } catch (err) {
      console.error('Failed to copy text: ', err);
      new Notice('Failed to copy visible open file content to clipboard.');
    }
  }

  /**
   * Copy content from all open files to clipboard (visible or not).
   */
  async copy_all_open_files_content() {
    const leaves = this.app.workspace.getLeaves();
    const files_set = new Set();

    for (const leaf of leaves) {
      const file = leaf.view?.file;
      if (file instanceof TFile && ['md', 'canvas'].includes(file.extension)) {
        files_set.add(file);
      }
    }

    if (files_set.size === 0) {
      new Notice('No open Markdown or Canvas files found.');
      return;
    }

    const contents_array = await Promise.all(
      Array.from(files_set).map(async (file) => {
        const file_content = await this.app.vault.read(file);
        return `---${file.path}---\n${file_content}\n\n`;
      })
    );

    const contents = contents_array.join('');

    try {
      await navigator.clipboard.writeText(contents);
      new Notice('All open files content copied to clipboard.');
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

  get_all_folders(rootFolder, folders) {
    folders.push(rootFolder);
    for (const child of rootFolder.children) {
      if (child instanceof TFolder) {
        this.get_all_folders(child, folders);
      }
    }
  }

  get_suggestions(query) {
    const lowerCaseQuery = query.toLowerCase();
    return this.allFolders.filter((folder) =>
      folder.path.toLowerCase().includes(lowerCaseQuery)
    );
  }

  render_suggestion(folder, el) {
    el.createEl('div', { text: folder.path });
  }

  on_choose_suggestion(folder, evt) {
    this.onChoose(folder);
  }
}
