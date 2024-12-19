import { Plugin, Notice, SuggestModal, TFile, TFolder, PluginSettingTab, Setting } from 'obsidian';
import { SmartContext } from './smart_context.js';

const DEFAULT_SETTINGS = {
  excluded_headings: []
};

export default class SmartContextPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SmartContextSettingTab(this.app, this));

    // Instantiate the SmartContext with callbacks and utils provided by plugin
    this.smartContext = new SmartContext({
      get_file_contents: async (file) => this.app.vault.read(file),
      resolve_link: (linkText, currentPath) => {
        const linked_file = this.app.metadataCache.getFirstLinkpathDest(linkText, currentPath);
        return linked_file?.path;
      },
      get_file_by_path: (path) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        return (f instanceof TFile) ? f : null;
      },
      get_embeds_for_file: (file) => {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache || !cache.embeds) return new Set();
        const embedded_files = new Set();
        for (const embed of cache.embeds) {
          const linked_file = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
          if (linked_file && (linked_file.extension === 'md' || linked_file.extension === 'canvas')) {
            embedded_files.add(linked_file.path);
          }
        }
        return embedded_files;
      },
      get_links_for_file: (file) => {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) return { links: [], embeds: [] };
        const links = [];
        const embeds = [];
        if (cache.links) {
          for (const link of cache.links) {
            const linked_file = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
            if (linked_file && (linked_file.extension === 'md' || linked_file.extension === 'canvas')) {
              links.push(linked_file.path);
            }
          }
        }
        if (cache.embeds) {
          for (const embed of cache.embeds) {
            const linked_file = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
            if (linked_file && (linked_file.extension === 'md' || linked_file.extension === 'canvas')) {
              embeds.push(linked_file.path);
            }
          }
        }
        return { links, embeds };
      },
      settings: this.settings
    });

    // Commands - feature parity with main-v1
    this.addCommand({
      id: 'copy-folder-contents',
      name: 'Copy folder contents to clipboard',
      callback: async () => {
        new FolderSelectModal(this.app, async (folder) => {
          const files = this.get_files_from_folder(folder, true);
          if (files.length === 0) {
            new Notice('No Markdown or Canvas files found in the selected folder.');
            return;
          }
          const folder_structure = this.generate_folder_structure(folder);
          const context_opts = {
            label: `${folder.name} folder structure`,
            mode: 'folder',
            files,
            folder_structure: folder_structure,
            excluded_headings: this.settings.excluded_headings,
            output_template: this.settings.output_template
          };
          const output = await this.smartContext.build_context(context_opts);
          await this.copyToClipboard(output);
        }).open();
      },
    });

    this.addCommand({
      id: 'copy-visible-open-files-content',
      name: 'Copy visible open files content to clipboard',
      callback: async () => {
        const visible_files = this.get_visible_open_files();
        if (visible_files.size === 0) {
          new Notice('No visible Markdown or Canvas files found.');
          return;
        }
        const context_opts = {
          label: 'Open files contents',
          mode: 'visible',
          files: Array.from(visible_files),
          excluded_headings: this.settings.excluded_headings,
          output_template: this.settings.output_template
        };
        const output = await this.smartContext.build_context(context_opts);
        await this.copyToClipboard(output);
      }
    });

    this.addCommand({
      id: 'copy-all-open-files-content',
      name: 'Copy all open files content to clipboard',
      callback: async () => {
        const files_set = this.get_all_open_files();
        if (files_set.size === 0) {
          new Notice('No open Markdown or Canvas files found.');
          return;
        }
        const context_opts = {
          label: 'Open files contents',
          mode: 'all-open',
          files: Array.from(files_set),
          excluded_headings: this.settings.excluded_headings,
          output_template: this.settings.output_template
        };
        const output = await this.smartContext.build_context(context_opts);
        await this.copyToClipboard(output);
      }
    });

    this.addCommand({
      id: 'copy-visible-open-files-content-with-linked',
      name: 'Copy visible open files content (with linked files) to clipboard',
      callback: async () => {
        const visible_files = this.get_visible_open_files();
        if (visible_files.size === 0) {
          new Notice('No visible Markdown or Canvas files found.');
          return;
        }
        const all_files = await this.get_all_linked_files_in_set(visible_files);
        const context_opts = {
          label: 'Visible open files',
          mode: 'visible-linked',
          initial_files: Array.from(visible_files),
          all_files: Array.from(all_files),
          excluded_headings: this.settings.excluded_headings,
          output_template: this.settings.output_template
        };
        const output = await this.smartContext.build_context(context_opts);
        await this.copyToClipboard(output);
      },
    });

    this.addCommand({
      id: 'copy-all-open-files-content-with-linked',
      name: 'Copy all open files content (with linked files) to clipboard',
      callback: async () => {
        const all_files = this.get_all_open_files();
        if (all_files.size === 0) {
          new Notice('No open Markdown or Canvas files found.');
          return;
        }
        const linked_all = await this.get_all_linked_files_in_set(all_files);
        const context_opts = {
          label: 'All open files',
          mode: 'all-open-linked',
          initial_files: Array.from(all_files),
          all_files: Array.from(linked_all),
          excluded_headings: this.settings.excluded_headings,
          output_template: this.settings.output_template
        };
        const output = await this.smartContext.build_context(context_opts);
        await this.copyToClipboard(output);
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
                const files = this.get_files_from_folder(file, true);
                if (files.length === 0) {
                  new Notice('No Markdown or Canvas files found in the selected folder.');
                  return;
                }
                const folder_structure = this.generate_folder_structure(file);
                const context_opts = {
                  label: `${file.name} folder structure`,
                  mode: 'folder',
                  files: files,
                  folder_structure: folder_structure,
                  excluded_headings: this.settings.excluded_headings,
                  output_template: this.settings.output_template
                };
                const output = await this.smartContext.build_context(context_opts);
                await this.copyToClipboard(output);
              });
          });
        }
      })
    );
  }

  async loadSettings() {
    let data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      new Notice('Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy text: ', err);
      new Notice('Failed to copy to clipboard.');
    }
  }

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

  generate_folder_structure(folder, prefix = '') {
    let structure = '';
    const children = folder.children.slice().sort((a, b) => {
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

  async get_all_linked_files_in_set(initial_files) {
    const all_files = new Set(initial_files);
    const processed_files = new Set();
    const files_to_process = new Set(initial_files);

    while (files_to_process.size > 0) {
      const current_file = files_to_process.values().next().value;
      files_to_process.delete(current_file);
      processed_files.add(current_file);

      const { links, embeds } = this.smartContext.get_links_for_file(current_file);
      const linked_paths = [...links, ...embeds];
      for (const p of linked_paths) {
        const f = this.app.vault.getAbstractFileByPath(p);
        if (f instanceof TFile && (f.extension === 'md' || f.extension === 'canvas')) {
          all_files.add(f);
          if (!processed_files.has(f)) {
            files_to_process.add(f);
          }
        }
      }
    }
    return all_files;
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

    new Setting(containerEl)
      .setName('Output Template')
      .setDesc('Template text to prepend before the copied content.')
      .addTextArea(text => text
        .setPlaceholder('Enter output template')
        .setValue(this.plugin.settings.output_template || '')
        .onChange(async (value) => {
          this.plugin.settings.output_template = value;
          await this.plugin.saveSettings();
        }));
  }
}
