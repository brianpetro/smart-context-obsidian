import { Plugin, Notice, SuggestModal, TFolder } from 'obsidian';
import { SmartFs } from 'smart-file-system/smart_fs.js';
import { SmartFsObsidianAdapter } from 'smart-file-system/adapters/obsidian.js';
import { SmartContext } from './smart_context.js';
import { SmartView } from 'smart-view';
import { SmartViewObsidianAdapter } from 'smart-view/adapters/obsidian.js';
import { SmartSettings } from 'smart-settings'; // <-- NEW

// Default fallback for brand-new users who haven't stored settings yet
const DEFAULT_SETTINGS = {
  excluded_headings: [],
  skip_exclude_links_in_active_file: false,
  before_prompt: '',
  before_each_prompt: '',
  after_each_prompt: '',
  after_prompt: '',
};

export default class SmartContextPlugin extends Plugin {
  async onload() {
    console.log('Loading SmartContextPlugin...');
    window.smart_context_plugin = this;

    // 1) Use SmartSettings to load existing plugin settings.
    //    This automatically overrides `this.settings`.
    //    Under the hood, SmartSettings calls plugin.loadData() and plugin.saveData().
    await SmartSettings.create(this, {
      load: async () => {
        // fallback: read from plugin data
        const loaded = await this.loadData();
        // merge with DEFAULT_SETTINGS
        return Object.assign({}, DEFAULT_SETTINGS, loaded);
      },
      save: async (settings) => {
        // save to plugin data
        await this.saveData(settings);
      },
    });

    // 2) Setup SmartFs so we don't pass Obsidian methods directly to SmartContext
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
      excluded_headings: this.settings.excluded_headings,
      skip_exclude_links_in_active_file: this.settings.skip_exclude_links_in_active_file,
    });

    // 4) Add a command example
    this.addCommand({
      id: 'copy-visible-open-files',
      name: 'Copy visible open files to clipboard',
      callback: async () => {
        const visible_files = this.get_visible_open_files();
        if (!visible_files.size) {
          new Notice('No visible files found.');
          return;
        }
        const output = await this.smartContext.build_context({
          mode: 'visible',
          label: 'Open files contents',
          files: Array.from(visible_files).map(f => ({ path: f.path })),
          excluded_headings: this.settings.excluded_headings,
          active_file_path: this.getActiveFilePath(),
          before_prompt: this.settings.before_prompt,
          before_each_prompt: this.settings.before_each_prompt,
          after_each_prompt: this.settings.after_each_prompt,
          after_prompt: this.settings.after_prompt
        });
        await this.copyToClipboard(output);
      }
    });

    // Right-click -> "Copy folder contents"
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item.setTitle('Copy folder contents to clipboard')
              .setIcon('documents')
              .onClick(async () => {
                const files = this.getFilesFromFolder(file);
                const folder_structure = this.renderFolderStructure(file);
                const output = await this.smartContext.build_context({
                  mode: 'folder',
                  label: `Folder: ${file.name}`,
                  folder_structure,
                  files: files.map(f => ({ path: f.path })),
                  excluded_headings: this.settings.excluded_headings,
                  before_prompt: this.settings.before_prompt,
                  before_each_prompt: this.settings.before_each_prompt,
                  after_each_prompt: this.settings.after_each_prompt,
                  after_prompt: this.settings.after_prompt
                });
                await this.copyToClipboard(output);
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

  get_visible_open_files() {
    const visible_files = new Set();
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      if (!leaf.view?.file) continue;
      const file = leaf.view.file;
      if (file.extension === 'md' || file.extension === 'canvas') {
        visible_files.add(file);
      }
    }
    return visible_files;
  }

  getActiveFilePath() {
    const af = this.app.workspace.getActiveFile();
    return af ? af.path : '';
  }

  getFilesFromFolder(folder) {
    const results = [];
    const queue = [folder];
    while (queue.length) {
      const current = queue.pop();
      for (const child of current.children) {
        if (child instanceof TFolder) queue.push(child);
        else if (child.extension === 'md' || child.extension === 'canvas') {
          results.push(child);
        }
      }
    }
    return results;
  }

  renderFolderStructure(folder, indent = '') {
    let s = '';
    const children = folder.children.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (child instanceof TFolder) {
        s += `${indent}${child.name}/\n`;
        s += this.renderFolderStructure(child, indent + '  ');
      } else {
        if (child.extension === 'md' || child.extension === 'canvas') {
          s += `${indent}${child.name}\n`;
        }
      }
    }
    return s;
  }


  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      new Notice('Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy text:', err);
      new Notice('Failed to copy.');
    }
  }
}

import { PluginSettingTab } from "obsidian";

class SmartContextSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.smartView = new SmartView({ adapter: SmartViewObsidianAdapter });
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    // Merge plugin's SmartContext settings_config
    const config = this.plugin.smartContext.settings_config;

    this.smartView.render_settings(config, {scope: this.plugin})
      .then(frag => {
        containerEl.appendChild(frag);
      });
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

  onChooseSuggestion(folder) {
    this.onChoose(folder);
  }
}
