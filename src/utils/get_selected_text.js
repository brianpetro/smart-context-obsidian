import { MarkdownView } from 'obsidian';
import { get_editor_selection } from './get_editor_selection.js';

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

/**
 * Retrieve selected text from an editor object.
 *
 * @param {object} editor - Editor with getSelection method.
 * @returns {string} Selected text or empty string.
 */
export function get_editor_selection(editor) {
  if (editor && typeof editor.getSelection === 'function') {
    return editor.getSelection();
  }
  return '';
}