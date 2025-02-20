/******************************************************
 * main.js
 * @fileoverview
 * Obsidian plugin entry point for Smart Context.
 ******************************************************/

import {
  Plugin,
  Notice,
  TFolder,
  normalizePath,
} from 'obsidian';

import { SmartFs } from 'smart-file-system/smart_fs.js';
import { SmartFsObsidianAdapter } from 'smart-file-system/adapters/obsidian.js';
import { is_text_file } from 'smart-file-system/utils/ignore.js';

import { SmartEnv } from 'smart-environment/obsidian.js';

import { LinkDepthModal } from './link_depth_modal.js';

import { SmartContexts, SmartContext } from 'smart-contexts';
import { AjsonMultiFileCollectionDataAdapter } from 'smart-collections/adapters/ajson_multi_file.js';
import { SmartContextSettingTab } from './settings.js';

import { SmartSources, SmartSource } from 'smart-sources';
import { AjsonMultiFileSourcesDataAdapter } from "smart-sources/adapters/data/ajson_multi_file.js";
import { MarkdownSourceContentAdapter } from "smart-sources/adapters/markdown_source.js";
// actions architecture
// import smart_block from "smart-blocks/smart_block.js";
import smart_source from "smart-sources/smart_source.js";

export default class SmartContextPlugin extends Plugin {
  LinkDepthModal = LinkDepthModal;
  /**
   * Plugin-level config for hooking up "smart_env" modules.
   */
  smart_env_config = {
    collections: {
      smart_contexts: {
        class: SmartContexts,
        data_adapter: AjsonMultiFileCollectionDataAdapter
      },
      smart_sources: {
        class: SmartSources,
        data_adapter: AjsonMultiFileSourcesDataAdapter,
        source_adapters: {
          "md": MarkdownSourceContentAdapter,
          "txt": MarkdownSourceContentAdapter,
          // "canvas": MarkdownSourceContentAdapter,
          // "default": MarkdownSourceContentAdapter,
        },
        process_embed_queue: false,
      },
      // smart_blocks: {
      //   class: SmartBlocks,
      //   data_adapter: AjsonMultiFileBlocksDataAdapter,
      //   block_adapters: {
      //     "md": MarkdownBlockContentAdapter,
      //     "txt": MarkdownBlockContentAdapter,
      //     // "canvas": MarkdownBlockContentAdapter,
      //   },
      // },
    },
    item_types: {
      SmartContext,
      SmartSource,
      // SmartBlock,
    },
    items: {
      smart_source,
      // smart_block,
    },
    modules: {
      smart_fs: {
        class: SmartFs,
        adapter: SmartFsObsidianAdapter,
      },
    },
    default_settings: {
      smart_contexts: {
        templates: {
          '-1': {
            before: '{{FILE_TREE}}'
          },
          '0': {
            before: '{{ITEM_PATH}}\n```{{ITEM_EXT}}',
            after: '```'
          },
          '1': {
            before: 'LINK: {{ITEM_NAME}}\n```{{ITEM_EXT}}',
            after: '```'
          },
          
        },
      },
    },
  };

  async onload() { this.app.workspace.onLayoutReady(this.initialize.bind(this)); } // initialize when layout is ready

  onunload() {
    console.log('Unloading SmartContextPlugin...');
  }

  async initialize() {
    console.log('Loading SmartContextPlugin...');

    // Initialize environment after Obsidian is ready
    await SmartEnv.create(this, this.smart_env_config);

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
                await this.copy_folder_without_modal(file);
              });
          });
        }
      })
    );

    // Settings tab
    this.addSettingTab(new SmartContextSettingTab(this.app, this));

    console.log('SmartContextPlugin loaded');
  }

  /**
   * Helper to return a path relative to parent_path.
   */
  get_relative_path(child_path, parent_path) {
    if (child_path === parent_path) return '';
    if (!child_path.startsWith(parent_path)) {
      return child_path;
    }
    let rel = child_path.slice(parent_path.length);
    if (rel.startsWith('/')) rel = rel.slice(1);
    return rel;
  }

  register_commands() {
    // Command: copy current note
    this.addCommand({
      id: 'copy-current-note-with-depth',
      name: 'Copy current note to clipboard',
      checkCallback: (checking) => {
        const base_items = [this.app.workspace.getActiveFile()];
        if (!base_items.length) return false;
        if (checking) return true;

        new this.LinkDepthModal(this, base_items).open();

        return true;
      },
    });

    // Command: copy visible open files
    this.addCommand({
      id: 'copy-visible-open-files',
      name: 'Copy visible open files (pick link depth)',
      checkCallback: (checking) => {
        const base_items = this.get_visible_open_files();
        if (!base_items.size) return false;
        if (checking) return true;

        new this.LinkDepthModal(this, base_items).open();
        return true;
      },
    });

    // Command: copy all open files
    this.addCommand({
      id: 'copy-all-open-files',
      name: 'Copy all open files (pick link depth)',
      checkCallback: (checking) => {
        const base_items = this.get_all_open_files();
        if (!base_items.size) return false;
        if (checking) return true;

        new this.LinkDepthModal(this, base_items).open();

        return true;
      },
    });
  }

  /**
   * Copy folder contents at depth=0, **including** non-text files by default.
   */
  async copy_folder_without_modal(folder) {
    // The main fix: add `context_opts: { includeNonText: true }` so subfiles are not filtered out.
    const sc_item = this.env.smart_contexts.create_or_update({
      context_items: { [folder.path]: true },
    });
    const { context, stats } = await sc_item.compile({ link_depth: 0 });
    await this.copy_to_clipboard(context);
    this.showStatsNotice(stats, `Folder: ${folder.path}`);
  }

  /**
   * Collect only visible open files.
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
   * Collect all open files in the workspace.
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
   * Copy text to clipboard.
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
   * Show user-facing notice summarizing stats.
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
        const total_excluded = Object.values(stats.exclusions).reduce(
          (p, c) => p + c,
          0
        );
        if (total_excluded > 0) {
          noticeMsg += `, ${total_excluded} section(s) excluded`;
        }
      }
    }
    new Notice(noticeMsg);
  }

}


