import { MarkdownView } from 'obsidian';
import { get_editor_selection } from 'obsidian-smart-env/utils/get_editor_selection.js';

/**
 * Get highlighted text from the active Obsidian Markdown view.
 *
 * @param {import('obsidian').App} app
 * @returns {string} Selected text or empty string.
 */
export function get_selected_text(app) {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  return get_editor_selection(view?.editor);
}

