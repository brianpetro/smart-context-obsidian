/**
 * @file context_select_modal.js
 * @description FuzzySuggestModal for selecting multiple vault notes. Each selection
 * remains "pilled" above the input. The user can then compile the context (merging
 * all selected items) using the `smart_contexts` collection.
 */

import {
  FuzzySuggestModal,
  TFile,
  setIcon
} from 'obsidian';

/**
 * @typedef {Object} SelectedItem
 * @property {TFile} file
 */

/**
 * Modal that lets the user pick multiple notes from the vault. Selected notes
 * appear above the input area as "pill" elements, and the modal remains open
 * for more selections until the user manually closes with Escape.
 */
export class ContextSelectModal extends FuzzySuggestModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;

    /** @type {SelectedItem[]} */
    this.selected_items = [];

    // Insert usage instructions
    this.setInstructions([
      { command: 'Enter', purpose: 'Add to context' },
      { command: 'Esc', purpose: 'Close' },
    ]);

    this.submit_btn_text = 'Build Context';
  }

  onOpen() {
    super.onOpen();
    if (this.current_input) {
      this.inputEl.value = this.current_input;
    }
    this.render_pills();
    this.inputEl.addEventListener('blur', () => {
      this.inputEl.focus();
    });
  }

  getItems() {
    const files = this.app.vault.getFiles();
    return files
      .filter(f => {
        if (f.extension.toLowerCase() !== 'md') return false;
        if (this.selected_items.some(i => i.file.path === f.path)) return false;
        return true;
      });
  }

  getItemText(file) {
    return file.path;
  }

  onChooseItem(file) {
    // Preserve the user's typed query
    this.current_input = this.inputEl.value;
    this.selected_items.push({ file });
    this.render_pills();
    // Remain open for additional picks
    this.open();
  }

  /**
   * Render the pill elements for each selected item.
   */
  render_pills() {
    if (this.submit_btn) {
      this.submit_btn.remove();
    }
    this.submit_btn = this.containerEl.createEl('button', { text: this.submit_btn_text });
    this.submit_btn.addEventListener('click', () => {
      this.submit();
    });
    if (this.modalEl && this.submit_btn) {
      this.modalEl.prepend(this.submit_btn);
    }

    if (this.selected_container_el) {
      this.selected_container_el.remove();
    }
    this.selected_container_el = this.containerEl.createDiv('sc-selected-pill-container');
    if (this.modalEl && this.selected_container_el) {
      this.modalEl.prepend(this.selected_container_el);
    }

    for (const sel of this.selected_items) {
      const pill = this.selected_container_el.createDiv('sc-selected-pill');
      pill.createSpan({ text: sel.file.basename });

      // Optional: add an 'x' icon to remove
      const remove_el = pill.createSpan({
        text: '  ✕',
        cls: 'sc-selected-pill-remove'
      });
      remove_el.addEventListener('click', () => {
        this.selected_items = this.selected_items.filter(x => x !== sel);
        this.render_pills();
      });
      setIcon(pill.createSpan({ cls: 'sc-selected-pill-icon' }), 'document');
    }
  }

  /**
   * Finalize the context: create/update a SmartContext item with all selected files,
   * compile it, and copy to clipboard.
   */
  async submit() {
    // Build a new or updated SmartContext item
    const pathsObj = this.selected_items.reduce((acc, s) => {
      acc[s.file.path] = true;
      return acc;
    }, {});

    // IMPORTANT FIX: Use 'context_items' instead of 'items'
    const context_item = await this.plugin.env.smart_contexts.create_or_update({
      context_items: pathsObj
    });

    // Compile and copy
    const { context, stats } = await context_item.compile();
    await this.plugin.copy_to_clipboard(context);
    this.plugin.showStatsNotice(
      stats,
      `${this.selected_items.length} file(s) selected`
    );
  }
}
