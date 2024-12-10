# Smart Context Plugin for Obsidian

**Smart Context** is an Obsidian plugin that helps you copy contents from folders and open files to your clipboard, with advanced configuration options—such as excluding specific heading sections. This streamlined copy functionality is particularly useful if you regularly work with AI tools like ChatGPT. You can quickly gather multiple files’ contents and feed them as "context" into ChatGPT to improve its understanding and responses.

By copying a set of files (including linked references), you can easily provide ChatGPT with a holistic set of project notes, research materials, or documentation, enabling it to give you more context-aware suggestions, summaries, or to generate more accurate answers.

## Features

- **Copy Folder Contents:**  
  Copy all Markdown and Canvas files from a selected folder to your clipboard, including a tree-like folder structure and their contents. This enables you to quickly provide entire project contexts to AI models at once.

- **Copy Visible Open Files:**  
  Copies content from only the currently visible open files. For instance, if you have multiple panes open with different notes, you can easily provide just those visible notes to ChatGPT, helping it understand your current focus area.

- **Copy All Open Files:**  
  Copies content from all open files in the workspace, regardless of visibility. Perfect for quickly gathering a broad context or a research set to feed into ChatGPT.

- **Exclude Sections by Heading:**  
  Configure specific headings that should be excluded from the copied output. This is helpful if you have confidential or irrelevant sections (`e.g., "Secret"`) that you don't want to share with ChatGPT or other tools.

- **Copy With Linked Files:**  
  For either visible or all open files, there are commands to also include any files linked within them. This lets you provide ChatGPT with an entire knowledge graph subset—an interconnected set of notes—giving the AI a more comprehensive understanding of your vault’s context.

- **Visual Notifications and Summaries:**  
  After copying, you’ll see a notification summarizing how many files were copied and how many sections were excluded. This helps you verify the integrity of the context before feeding it into an AI model.

## Usage

**The following commands are available via the Command Palette (`Ctrl/Cmd + P`):**

- **Copy Folder Contents to Clipboard:**
  1. Run **"Copy Folder Contents to Clipboard"**.
  2. A modal will appear allowing you to select a folder.
  3. Confirm to copy the folder’s structure and contents.
  4. Useful for providing a large context (e.g., an entire project’s files) to ChatGPT.

- **Copy Visible Open Files Content to Clipboard:**
  1. Run **"Copy Visible Open Files Content to Clipboard"**.
  2. Only the content from currently visible (active) tabs is copied.
  3. Great for focused prompts—copy just the notes you’re currently working on and give them to ChatGPT.

- **Copy All Open Files Content to Clipboard:**
  1. Run **"Copy All Open Files Content to Clipboard"**.
  2. Copies all open files, providing a broad context. Ideal for feeding multiple related notes to ChatGPT at once.

- **Copy Visible Open Files Content (With Linked Files) to Clipboard:**
  1. Run **"Copy Visible Open Files Content (With Linked Files) to Clipboard"**.
  2. The plugin not only copies the currently visible open files but also recursively includes all files they link to.
  3. This allows you to give ChatGPT a richer, more connected context from your vault.

- **Copy All Open Files Content (With Linked Files) to Clipboard:**
  1. Run **"Copy All Open Files Content (With Linked Files) to Clipboard"**.
  2. Like the above command, but starting from all open files, pulling in their entire network of linked files.
  3. Ideal for providing ChatGPT with a complete knowledge graph excerpt.

**Context Menu on Folders:**
1. Right-click on a folder in the File Explorer.
2. Select **"Copy folder contents to clipboard"** for a quick one-step copy.

## Settings

- **Excluded Headings:**
  - In **Settings > Community Plugins > Smart Context**, you can enter headings to exclude (without `#`).
  - For example, `Secret` will exclude any section that starts with `# Secret`, `## Secret`, or `### Secret` headings.
  - This lets you refine the content before providing it as AI context, keeping any sensitive or irrelevant sections out.

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
