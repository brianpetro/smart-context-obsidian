# Smart Context Plugin for Obsidian

**Smart Context** is an Obsidian plugin that helps you efficiently copy contents from folders and open files to your clipboard, with advanced configuration options such as excluding specific heading sections.

## Features

- **Copy Folder Contents:**  
  Copy all Markdown and Canvas files from a selected folder to your clipboard, including a tree-like folder structure at the top.  
  Each file is separated by delimiters, and the file path is shown before its content.

- **Copy Visible Open Files:**  
  Copies content from only the currently visible open files (e.g., the active tab in each pane).

- **Copy All Open Files:**  
  Copies content from all open files in the workspace, regardless of visibility.

- **Exclude Sections by Heading:**  
  Configure excluded headings in the plugin’s settings. Any section starting with an excluded heading (at any heading level) will be removed from the copied output. For example, if you exclude `Secret`, then `## Secret`, `### Secret`, or any heading that ends with `Secret` will be excluded along with its section until the next heading of equal or higher level.

- **Visual Notifications and Summaries:**  
  After copying, you’ll see a notification summarizing how many files were copied and how many sections (if any) were excluded.

## Installation

1. Open Obsidian and go to **Settings > Community Plugins**.
2. Click "Open folder" or navigate to `.obsidian/plugins/` directory in your vault folder.
3. Create or copy the `smart-context-plugin` folder and include:
   - `main.js`
   - `manifest.json`
   - `styles.css` (optional, if provided)
   
4. Return to Obsidian and enable **Community Plugins** if not already done.
5. Locate **Smart Context** in the Community Plugins tab and enable it.

## Usage

- **Copy Folder Contents:**
  1. Open the Command Palette (`Ctrl/Cmd + P`).
  2. Search for **"Copy Folder Contents to Clipboard"**.
  3. Select a folder from the modal and confirm.
  4. The folder structure and file contents are now on your clipboard.

- **Copy Visible Open Files:**
  1. Open the Command Palette.
  2. Run **"Copy Visible Open Files Content to Clipboard"**.
  3. Only the content from currently visible (active) tabs in open panes is copied.

- **Copy All Open Files:**
  1. Open the Command Palette.
  2. Run **"Copy All Open Files Content to Clipboard"**.
  3. All open files are copied, regardless of visibility.

- **Context Menu on Folders:**
  1. Right-click on a folder in the File Explorer.
  2. Select **"Copy folder contents to clipboard"** for a quick copy.

## Settings

Open **Settings > Community Plugins > Smart Context** to find the settings tab:

- **Excluded Headings:**
  - Enter headings you want to exclude, without `#` characters. For example, type `Secret` to exclude any section starting with a heading that ends with `Secret` (e.g., `## Secret`, `### Secret`).
  - Separate multiple headings by commas or new lines.

When you copy content, any sections under excluded headings will be removed. You’ll receive a notification of how many sections were excluded.

## Formatting

The copied content uses a standardized format:

For folders:
```
<folder_name> Folder Structure:
<tree_structure>

File Contents:
----------------------
/<relative_file_path>
-----------------------
<file_content>
-----------------------
```

For open files:
```
Open Files Contents:
----------------------
/<file_path>
-----------------------
<file_content>
-----------------------
```

## Example

If you have a file with the following content:
```
# Notes
Some general notes here.

## Secret
This should be excluded.

## Visible
This will be included.
```

And you’ve configured the excluded heading as `Secret`, the `## Secret` section won’t appear in the clipboard output.

## Contributing

Feel free to open issues or submit pull requests to improve this plugin.

## License

This plugin is distributed under the [MIT License](LICENSE).
