/**
 * @file external_select_modal.js
 * @description FuzzySuggestModal subclass for browsing outside the vault.
 * SHIFT+ENTER now opens directories (same as right arrow),
 * and CTRL+ENTER inserts a path while keeping the modal open.
 * Folders are indicated with a trailing slash in the suggestion list.
 */

import {
  Notice,
  FuzzySuggestModal,
  MarkdownView,
  Keymap,
  setIcon
} from 'obsidian';
import fs from 'fs';
import path from 'path';
import { should_ignore } from 'smart-file-system/utils/ignore.js';

/**
 * @typedef {Object} FileItem
 * @property {string} fullPath - The absolute path to the file or folder
 * @property {string} relativePath - The path relative to `rootPath` (so subfolders appear as "sub1/sub2/file.txt")
 * @property {boolean} isDirectory
 */

/**
 * Convert an absolute path to a vault-relative path, using ../ if needed.
 */
function get_relative_path_to_vault(vaultPath, targetPath) {
  const relativePath = path.relative(vaultPath, targetPath);
  return relativePath.replace(/\\/g, '/');
}

/**
 * Recursively gather children up to a specified depth limit, storing `relativePath` for display.
 * @param {string} directoryPath - The absolute path of the folder where we start
 * @param {string} rootPath - The same as `directoryPath` for level=0, stays constant for recursion
 * @param {number} currentDepth - The current depth in recursion
 * @param {number} maxDepth - The maximum depth to include
 * @returns {FileItem[]}
 */
function list_directory_contents_up_to_depth(directoryPath, rootPath, currentDepth = 0, maxDepth = 2) {
  const items = [];
  if (currentDepth > maxDepth) return items;
  let children;
  try {
    children = fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch (_) {
    return items;
  }
  for (const dirent of children) {
    const fullPath = path.join(directoryPath, dirent.name);
    const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');
    const isDirectory = dirent.isDirectory();
    if (should_ignore(relativePath, ['.git', 'node_modules', 'package-lock.json'])) {
      continue;
    }
    items.push({
      fullPath,
      relativePath,
      isDirectory
    });
    if (isDirectory && (currentDepth + 1) <= maxDepth) {
      const subItems = list_directory_contents_up_to_depth(fullPath, rootPath, currentDepth + 1, maxDepth);
      items.push(...subItems);
    }
  }
  return items;
}

export class ExternalSelectModal extends FuzzySuggestModal {
  /**
   * @param {import("obsidian").App} app
   * @param {string} initialScope - The absolute path to start listing items
   * @param {string} vaultPath - The absolute path to the vault folder
   */
  constructor(app, initialScope, vaultPath) {
    super(app);
    this.app = app;
    this.currentScope = initialScope;
    this.vaultPath = vaultPath;

    this.preventClose = false; // allows Ctrl+ENTER insertion without closing

    // Show usage instructions in the modal
    this.setInstructions([
      { command: 'Enter', purpose: 'Insert path and close' },
      { command: '⌘/Ctrl + Enter', purpose: 'Insert path (stay open)' },
      { command: 'Shift+Enter / →', purpose: 'Open directory' },
      { command: 'Esc / ←', purpose: 'Close' }
    ]);

    // Keydown logic
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        this.openDir = true;
        this.selectActiveSuggestion(e);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.openDir = true;
        this.selectActiveSuggestion(e);
      } else if (e.key === 'Enter' && Keymap.isModEvent(e)) {
        e.preventDefault();
        this.preventClose = true;
        this.openDir = false;
        this.selectActiveSuggestion(e);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.selectActiveSuggestion(e);
      }
      // Normal Enter => default behavior from base class
    });
  }

  open() {
    this.openDir = false;
    super.open();
  }
  close() {
    if (this.preventClose) {
      this.preventClose = false;
      return;
    }
    super.close();
  }

  /**
   * Gather items up to depth=2 under this.currentScope.
   * Also add '..' if not at system root.
   * @returns {FileItem[]}
   */
  getItems() {
    const items = [];
    const { root } = path.parse(this.currentScope);

    // If not at a filesystem root, add a special parent directory item
    if (this.currentScope !== root) {
      items.push({
        fullPath: path.join(this.currentScope, '..'),
        relativePath: '..',
        isDirectory: true
      });
    }
    // Now gather everything up to depth=2 from currentScope
    //  rootPath is currentScope so relativePath is all subfolders from there
    const listing = list_directory_contents_up_to_depth(this.currentScope, this.currentScope, 0, 2);
    items.push(...listing);
    return items;
  }

  /**
   * Display text in the suggestions.
   * We'll show `item.relativePath`.
   */
  getItemText(item) {
    return item.relativePath + (item.isDirectory ? '/' : '');
  }

  renderSuggestion({ item }, el) {
    const text_el = el.createEl('span');
    text_el.setText(this.getItemText(item));
    if (item.isDirectory) {
      el.addClass('sc-modal-suggestion-has-icon');
      const icon_el = el.createEl('span');
      setIcon(icon_el, 'folder');
    }
    return el;
  }

  /**
   * Called when user picks an item from the list.
   */
  onChooseItem(item, evt, openDir = this.openDir) {
    console.log({ item, evt, openDir });
    const isUpOne = (item.relativePath === '..' || evt.key === 'ArrowLeft');
    if (isUpOne) {
      this.currentScope = path.join(this.currentScope, '..');
      this.open();
      return;
    }
    if (item.isDirectory && openDir) {
      this.currentScope = item.fullPath;
      this.open();
      return;
    }

    // Otherwise, insert the path
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active file is open.');
      return;
    }
    const relPath = get_relative_path_to_vault(this.vaultPath, item.fullPath);
    this.insert_into_smart_context(activeFile, relPath)
      .then(() => {
        new Notice(`Inserted ${item.isDirectory ? 'folder' : 'file'} path: ${relPath}`);
      })
      .catch((err) => {
        new Notice(`Error inserting path: ${err}`);
      });
  }

  /**
   * Insert or append `relPath` into a ```smart-context codeblock in the current file.
   */
  async insert_into_smart_context(file, relPath) {
    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    let startIdx = -1, endIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('```smart-context')) {
        startIdx = i;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim().startsWith('```')) {
            endIdx = j;
            break;
          }
        }
        break;
      }
    }
    if (startIdx === -1) {
      // No block => insert new codeblock below the cursor or at bottom
      const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!mdView || mdView.file !== file) {
        lines.push('```smart-context');
        lines.push(relPath);
        lines.push('```');
      } else {
        const editor = mdView.editor;
        const cursorLine = editor.getCursor().line;
        const insertPos = cursorLine + 1;
        lines.splice(insertPos, 0, '```smart-context', relPath, '```');
      }
    } else {
      // We have an existing block => insert above the closing fence
      lines.splice(endIdx, 0, relPath);
    }
    const newContent = lines.join('\n');
    await this.app.vault.modify(file, newContent);
  }
}
