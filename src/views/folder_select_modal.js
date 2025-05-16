import {
  SuggestModal,
  TFolder
} from 'obsidian';

/**
 * Modal that lists all folders for the user to pick from.
 */
export class FolderSelectModal extends SuggestModal {
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
    return folders.filter((folder) => folder.path.toLowerCase().includes(query.toLowerCase())
    );
  }

  renderSuggestion(folder, el) {
    el.createEl('div', { text: folder.path });
  }

  onChooseSuggestion(folder) {
    this.onChoose(folder);
  }
}
