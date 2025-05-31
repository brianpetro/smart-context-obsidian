import { Notice, Platform } from 'obsidian';

/**
 * Copy text to clipboard in a cross-platform manner.
 * On mobile, Node/Electron APIs are unavailable.
 */

export async function copy_to_clipboard(text) {
  try {
    // First try standard browser clipboard API
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }

    // If not on mobile, attempt Electron's clipboard
    else if (!Platform.isMobile) {
      const { clipboard } = require('electron');
      clipboard.writeText(text);
    }

    // Otherwise, no known method for copying
    else {
      new Notice('Unable to copy text: no valid method found.');
    }
  } catch (err) {
    console.error('Failed to copy text:', err);
    new Notice('Failed to copy.');
  }
}
