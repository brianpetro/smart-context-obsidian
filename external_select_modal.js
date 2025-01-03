/**
 * @file external_select_modal.js
 * @description FuzzySuggestModal subclass for browsing outside the vault. 
 * Added SHIFT+ENTER support to insert paths while keeping the modal open.
 */

import {
  Notice,
  FuzzySuggestModal,
  MarkdownView,
  Keymap
} from 'obsidian';
import fs from 'fs';
import path from 'path';

/**
 * @typedef {Object} FileItem
 * @property {string} fullPath - The absolute path to the file or folder
 * @property {string} displayName - The filename or folder name
 * @property {boolean} isDirectory - Whether this item is a directory
 */

/**
 * Convert an absolute path to a vault-relative path, using ../ if needed.
 * @param {string} vaultPath - The path to the vault folder, absolute.
 * @param {string} targetPath - The absolute path we want to reference.
 * @returns {string} A relative path from the vault root, using ../ as needed.
 */
function get_relative_path_to_vault(vaultPath, targetPath) {
  const relativePath = path.relative(vaultPath, targetPath);
  // On Windows, path.relative uses backslashes. Obsidian typically handles forward slashes well.
  return relativePath.replace(/\\/g, '/');
}

/**
 * List immediate children of `directoryPath`.
 * If the directory doesn't exist or is not readable, returns empty array.
 * @param {string} directoryPath
 * @returns {FileItem[]}
 */
function list_directory_contents(directoryPath) {
  const results = [];
  try {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    for (const dirent of entries) {
      const fullPath = path.join(directoryPath, dirent.name);
      results.push({
        fullPath,
        displayName: dirent.name,
        isDirectory: dirent.isDirectory(),
      });
    }
  } catch (err) {
    console.warn('Error reading directory:', directoryPath, err);
  }
  return results;
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

    /**
     * When true, we override the base-class close() to keep the modal open.
     * This is set in SHIFT+ENTER scenarios.
     * @type {boolean}
     */
    this.preventClose = false;

    // Provide usage instructions
    this.setInstructions([
      {
        command: 'Enter / →',
        purpose: 'Insert path to selection'
      },
      {
        command: 'Ctrl+Enter',
        purpose: 'Open folder'
      },
      {
        command: 'Shift+Enter',
        purpose: 'Insert path and keep this modal open'
      },
      {
        command: 'Esc / ←',
        purpose: 'Close'
      }
    ]);

    // Keydown to handle arrow-right, ctrl+enter, or shift+enter
    this.inputEl.addEventListener('keydown', (e) => {
      // Right arrow => forcibly open directory
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.selectActiveSuggestion(e, true);
      }
      // Ctrl+Enter => open directory as well
      else if (e.key === 'Enter' && Keymap.isModEvent(e)) {
        e.preventDefault();
        this.selectActiveSuggestion(e, true);
      }
      // Shift+Enter => insert path but DO NOT close the modal
      else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        this.preventClose = true;
        // Pass false so we treat it like a normal "insert path" flow
        this.selectActiveSuggestion(e, false);
      }
    });
  }

  /**
   * Override close() so SHIFT+ENTER can keep the modal open.
   * If this.preventClose is true for that selection, skip closing.
   * The next selection might not hold shift, so we reset preventClose after skipping once.
   */
  close() {
    if (this.preventClose) {
      // Let SHIFT+ENTER keep it open exactly once; reset so 
      // if user does normal ENTER next time, the modal can close.
      this.preventClose = false;
      return;
    }
    super.close();
  }

  /**
   * Gather the directory items for fuzzy searching.
   * We'll always add a "Go up a folder" (..) item at the top if not at root.
   * @returns {FileItem[]}
   */
  getItems() {
    const items = [];
    const { root } = path.parse(this.currentScope);

    // If not at a filesystem root, add a special "parent directory" item
    if (this.currentScope !== root) {
      items.push({
        fullPath: path.join(this.currentScope, '..'),
        displayName: '<UP ONE DIRECTORY>',
        isDirectory: true,
      });
    }

    // Now read the current directory
    const listing = list_directory_contents(this.currentScope);
    listing.forEach((item) => items.push(item));
    return items;
  }

  /**
   * Display name in the suggestion list.
   * @param {FileItem} item
   * @returns {string}
   */
  getItemText(item) {
    return item.displayName;
  }

  /**
   * Called when the user chooses an item.
   * - If user selects "<UP ONE DIRECTORY>", we re-open in parent scope.
   * - If `openDir` param is true, attempt to open directories even if it’s a normal Enter press.
   * - Otherwise, insert the path into "smart-context" code block if it’s a file or folder.
   * @param {FileItem} item
   * @param {MouseEvent | KeyboardEvent} evt
   * @param {boolean} [openDir=false]
   */
  onChooseItem(item, evt, openDir = false) {
    // If the user triggered SHIFT+ENTER, we can detect it from the event
    const shiftHeld = evt instanceof KeyboardEvent ? evt.shiftKey : false;
    const ctrlHeld = evt ? Keymap.isModEvent(evt) : false;

    // 1) If the user picked "<UP ONE DIRECTORY>", just navigate up
    if (item.displayName === '<UP ONE DIRECTORY>') {
      this.currentScope = path.join(this.currentScope, '..');
      this.open();
      return;
    }

    // 2) If it's a directory (or forced to openDir)
    if (item.isDirectory && (ctrlHeld || openDir)) {
      this.currentScope = item.fullPath;
      this.open();
      return;
    }

    // 3) Insert the path (folder or file) into the active file's "smart-context" codeblock
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active file is open.');
      return;
    }
    const relPath = get_relative_path_to_vault(this.vaultPath, item.fullPath);

    this.insert_into_smart_context(activeFile, relPath)
      .then(() => {
        if (item.isDirectory) {
          new Notice(`Inserted folder path: ${relPath}`);
        } else {
          new Notice(`Inserted file path: ${relPath}`);
        }
        // SHIFT+ENTER logic is already handled by preventClose 
        // so we do not re-open the modal here explicitly.
      })
      .catch((err) => {
        new Notice(`Error inserting path: ${err}`);
      });
  }

  /**
   * Insert (or append) `relPath` into a codeblock named `smart-context` in the given file.
   * If that codeblock does not exist, we insert it on a new line immediately below the cursor.
   * If it does exist, we append one line before the closing fence.
   * @param {import("obsidian").TFile} file
   * @param {string} relPath
   */
  async insert_into_smart_context(file, relPath) {
    const content = await this.app.vault.read(file);
    const lines = content.split('\n');

    let startIdx = -1;
    let endIdx = -1;

    // find code fence for ```smart-context
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('```smart-context')) {
        startIdx = i;
        // find matching fence
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
      // codeblock doesn't exist: insert at line below cursor, or fallback to bottom
      const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!mdView || mdView.file !== file) {
        // Just append at bottom if we can't match the current editor
        lines.push('```smart-context');
        lines.push(relPath);
        lines.push('```');
      } else {
        const editor = mdView.editor;
        const cursorLine = editor.getCursor().line;
        // Insert a new code block at cursorLine+1
        const insertPos = cursorLine + 1;
        lines.splice(insertPos, 0, '```smart-context', relPath, '```');
      }
    } else {
      // There's an existing code block; insert one line above the closing fence
      lines.splice(endIdx, 0, relPath);
    }

    const newContent = lines.join('\n');
    await this.app.vault.modify(file, newContent);
  }
}
