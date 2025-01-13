# Smart Context Plugin for Obsidian

**Smart Context** is an Obsidian plugin that helps you copy contents from folders and open files to your clipboard, with advanced configuration options—such as excluding specific heading sections. This streamlined copy functionality is particularly useful if you regularly work with AI tools like ChatGPT. You can quickly gather multiple files’ contents and feed them as "context" into ChatGPT to improve its understanding and responses.

By copying a set of files (including linked references), you can easily provide ChatGPT with a holistic set of project notes, research materials, or documentation, enabling it to give you more context-aware suggestions, summaries, or to generate more accurate answers.

---

## Features

- **Copy Folder Contents:**  
  Copy all Markdown and Canvas files from a selected folder to your clipboard, including a tree-like folder structure and their contents. This enables you to quickly provide entire project contexts to AI models at once.

- **Copy Visible Open Files:**  
  Copies content from only the currently visible open files. For instance, if you have multiple panes open with different notes, you can easily provide just those visible notes to ChatGPT, helping it understand your current focus area.

- **Copy All Open Files:**  
  Copies content from all open files in the workspace, regardless of visibility. Perfect for quickly gathering a broad context or a research set to feed into ChatGPT at once.

- **Exclude Sections by Heading:**  
  Configure specific headings that should be excluded from the copied output. This is helpful if you have confidential or irrelevant sections (e.g., “Secret”) that you don’t want to share with ChatGPT or other tools.

- **Copy With Linked Files:**  
  For either visible or all open files, there are commands to also include any files linked within them. This lets you provide ChatGPT with an entire knowledge graph subset—an interconnected set of notes—giving the AI a more comprehensive understanding of your vault’s context.

- **Visual Notifications and Summaries:**  
  After copying, you’ll see a notification summarizing how many files were copied and how many sections were excluded. This helps you verify the integrity of the context before feeding it into an AI model.

---

## Usage

**The following commands are available via the Command Palette (`Ctrl/Cmd + P`):**

1. **Copy Folder Contents to Clipboard**  
   - A modal appears allowing you to select a folder.  
   - Confirms to copy the folder’s structure and contents.  
   - Useful for providing a large context (e.g., an entire project’s files) to ChatGPT.

2. **Copy Visible Open Files Content to Clipboard**  
   - Only the content from currently visible (active) panes is copied.  
   - Great for focused prompts—copy just the notes you’re working on.

3. **Copy All Open Files Content to Clipboard**  
   - Copies content from all open files, providing a broad context.  
   - Ideal for feeding multiple related notes to ChatGPT at once.

4. **Copy Visible Open Files Content (With Linked Files) to Clipboard**  
   - Copies both the currently visible open files and all files they link to (recursively).  
   - Perfect for giving ChatGPT a richer, connected context from your vault.

5. **Copy All Open Files Content (With Linked Files) to Clipboard**  
   - Like above but starts with all open files plus their linked references.  
   - Ideal for providing ChatGPT with a complete knowledge graph excerpt.

**Context Menu on Folders**  
- Right-click on a folder in the File Explorer.  
- Select **"Copy folder contents to clipboard"** for a quick one-step copy.

---

## External File Browser (Desktop Only)

- **Open External File Browser**  
  1. Run **"Open External File Browser"** from the Command Palette.  
  2. A fuzzy suggest modal opens, showing files and folders _outside_ your Obsidian vault.
     - Folder names end with a slash (e.g., `Documents/`) to distinguish them from files.
  3. The first item in the list (`..`) takes you up one directory level.  
  4. **Navigation and Selection Shortcuts:**  
     - **Right Arrow** or **Shift + Enter**: Open (drill into) the selected directory.  
     - **Enter**: Insert the selected file/folder path into the active file’s `smart-context` codeblock **and close** the modal.  
     - **Ctrl + Enter**: Insert the path **but keep the modal open** for additional selections.  
     - **Left Arrow**: Go back to the previous directory.  
     - **Esc**: Close the modal.  
  5. Selecting a file (using Enter or Ctrl+Enter) inserts its vault-relative path into a `smart-context` codeblock:
     - If the `smart-context` codeblock doesn’t exist in your active file, it is created right below your current cursor line.
     - If it does exist, new paths are appended to the block.
  6. Selecting a folder inserts that folder’s relative path as well (including the slash if desired).  
  7. A notice appears in Obsidian confirming the inserted path.
  8. This feature uses Node’s `fs` library, so it only works on Obsidian Desktop. On mobile, the command is unavailable.

---

## Using `smart-context` Codeblocks

A `smart-context` codeblock is a code-fenced section within your active file:

<pre><code>```smart-context
path/to/someFolder
path/to/someFile.md
```
</code></pre>

When you run any **copy** command (e.g., **"Copy Folder Contents to Clipboard"**), the plugin checks if the _active file_ contains a `smart-context` codeblock. If it does, all paths listed inside that codeblock are included in the copied context. That means you can declare extra paths or entire folders that you want to include, regardless of which vault notes or commands you select.

- **Folder Paths**: If you specify a directory (e.g., `path/to/myFolder`), the plugin includes all `.md` and `.canvas` files from that folder—respecting `.scignore` or `.gitignore` patterns if present in that directory.  
- **File Paths**: If you specify a single file (e.g., `exampleNote.md`), it will be pulled in directly.  
- **Automatic Creation**: Selecting a file or folder from the External File Browser command will create or append lines to this codeblock, making it easy to gather external references all in one place.  
- **Inline with Main Context**: The final text you copy to the clipboard merges these `smart-context` references with whatever else you’re copying (e.g., open files, folder contents, etc.).

---

## Settings

In **Settings → Community Plugins → Smart Context**, you’ll find the following options:

- **Excluded Headings** (array of strings)  
  Headings to exclude from copied content (e.g., “Secret”).

- **Link Depth** (number)  
  Defines how many link “hops” to follow for “with linked” copy commands. For instance, if `link_depth = 2`, a file linking to another, which links to another, will be included.

- **Include File Tree** (toggle)  
  If ON, includes a file tree in the output for “Copy Folder Contents.”

- **Max Linked Files** (number, default 0 = no limit)  
  Caps how many files are pulled in (BFS expansions) when using “with linked” commands.

- **Before Prompt (once)** (text)  
  Inserts text at the top of the final copied content. Can include placeholders like `{{FILE_PATH}}` or `{{FILE_NAME}}`.

- **Before Each File** (text)  
  Inserts text right before each file’s content is appended (e.g., `<context path="{{FILE_PATH}}">`).

- **After Each File** (text)  
  Inserts text immediately after each file’s content.

- **After Prompt (once)** (text)  
  Inserts text at the very bottom of the final copied content (often used for closing remarks or markdown delimiters).

---

## Formatting

Copied content follows a structured format. For instance, for a folder:

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

And for open files:

```
Open Files Contents:
----------------------
/<file_path>
-----------------------
<file_content>
-----------------------
```

---

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

And you’ve configured the excluded heading as `Secret`, the **“Secret”** section won’t appear in the clipboard output.

---

## Contributing

Feel free to open issues or submit pull requests to improve this plugin.

---

## License

This plugin is distributed under the [MIT License](LICENSE).