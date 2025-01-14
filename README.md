# Smart Context Plugin for Obsidian

**Smart Context** is an Obsidian plugin that helps you copy contents from folders, open files, multiple selected notes, and even external file paths to your clipboard, with advanced configuration—such as excluding specific heading sections or ignoring entire files via `.gitignore` or `.scignore`. This is particularly useful when working with AI tools like ChatGPT, letting you feed large sets of project notes, research, or documentation as "context" to improve AI responses and accuracy.

---

## Features

- **Copy Folder Contents**  
  Copy all Markdown (and Canvas) files from a selected folder to your clipboard, optionally including the folder tree. This is perfect for quickly giving AI models an entire project's context.

- **Copy Visible Open Files**  
  Copies content from only the currently visible open files, so you can provide precisely the subset of notes you’re focused on to ChatGPT or other tools.

- **Copy All Open Files**  
  Copies content from every open file in the workspace (regardless of visibility). This is a fast way to gather everything you have open at once.

- **Exclude Sections by Heading**  
  Configure specific headings (glob patterns) to exclude. For example, headings named "Secret" or "Confidential" can automatically be removed before the content is copied.

- **Ignore Certain Files**  
  Place a `.scignore` or `.gitignore` in your vault or subfolders. Files matching those patterns (e.g., large low-relevance files, secret notes) will be skipped when you copy folder contents or gather external references.

- **Copy With Linked Files**  
  Extend your context by also including notes that your currently open files link to (recursively), building a more complete knowledge graph subset for the AI.

- **Build Context (Multiple File Selection)**  
  A dedicated **"Build Context"** command opens a modal to pick multiple vault notes in a single session. Each selected note appears as a "pill," and you can keep choosing more until you click **"Build Context"**. This then compiles and copies all selected files into a single context string.

- **External File Browser (Desktop Only)**  
  Browse files and folders _outside_ of your Obsidian vault. You can insert their paths into a `smart-context` codeblock in your active note. Useful when referencing external documents or folders.

- **Visual Notifications and Summaries**  
  After copying, the plugin shows a notice summarizing how many files were copied, how many sections were excluded, and more.

---

## Usage

### Main Commands (Command Palette)

1. **Build Context (Multiple File Selection)**  
   - Opens a modal listing your vault’s notes.  
   - Each time you press 'Enter' on a suggestion, that note is added as a pill above the input.  
   - Press the **"Build Context"** button (or hit 'Esc') once finished selecting.  
   - The chosen notes are merged, respecting any excluded headings and ignoring patterns, then copied to your clipboard.

2. **Copy Folder Contents to Clipboard**  
   - Prompts you to pick a folder.  
   - Gathers all recognized text files, merges them into a single output, and copies to the clipboard.  
   - Respects `.scignore` or `.gitignore` patterns within that folder to skip certain files.

3. **Copy Visible Open Files Content to Clipboard**  
   - Copies only the content from currently visible (active) panes.

4. **Copy All Open Files Content to Clipboard**  
   - Copies content from every open file in the workspace.

5. **Copy Visible Open Files Content (With Linked Files) to Clipboard**  
   - Same as #3 but also includes files they link to (recursively).

6. **Copy All Open Files Content (With Linked Files) to Clipboard**  
   - Same as #4 but also includes files they link to (recursively).

7. **Open External File Browser**  
   - Desktop-only command.  
   - Lets you navigate above or outside your vault and insert external file/folder paths into a `smart-context` codeblock.

### Context Menu on Folders
- Right-click a folder in Obsidian’s File Explorer.  
- Select **"Copy folder contents to clipboard"** to quickly gather the folder's files.

---

## External File Browser (Desktop Only)

When you run **"Open External File Browser"**:
1. A modal appears, starting in the vault’s parent folder.
2. Navigate by:
   - **Right Arrow** or **Shift + Enter**: Open (drill into) the selected directory.
   - **Enter**: Insert the selected file/folder path into the active file's `smart-context` block **and close** the modal.
   - **Ctrl + Enter**: Insert the path **but keep the modal open**, letting you select multiple external paths.
   - **Arrow Left**: Go up a directory (or pick `..`).
   - **Esc**: Close the modal.

Any inserted paths appear in a `smart-context` codeblock within the active note, so the plugin can pull them in later during a copy command.

---

## Using `smart-context` Codeblocks

A codeblock like this:

<pre><code>```smart-context
folderA/subFolder
path/to/someFile.md
```
</code></pre>

- **Folder Paths**: If a path is a directory, the plugin includes all recognized text files within it (respecting `.scignore` or `.gitignore`).
- **File Paths**: A line referencing a single `.md` or `.canvas` is included as well.
- **Automatic Creation**: If no `smart-context` codeblock exists in your note, selecting a file or folder in the External File Browser or the “Build Context” modal automatically creates one (or appends more paths).
- **Merged with Main Context**: Whenever you run a **copy** command, the plugin merges any paths in your `smart-context` codeblock with your chosen set of notes/folders.

---

## Settings

In **Settings → Community Plugins → Smart Context**, you can configure:

- **Excluded Headings**  
  Array of headings (supports glob patterns, e.g., "*Secret*") to remove from the copied text.
  
- **Link Depth**  
  How many "hops" of linked files to follow for "with linked" commands.
  
- **In-links**  
  Whether to also include notes that link *into* your currently selected file(s).
  
- **Ignore Patterns**  
  By placing `.scignore` or `.gitignore` in folders, the plugin can skip large or irrelevant files automatically.

- **Before / After Context**  
  Custom text inserted at the very beginning or end of the final copied content. Can use placeholders like `{{FILE_TREE}}`.

- **Before / After Each Item**  
  Text inserted before/after each primary file’s content. Can use placeholders including:
  - `{{ITEM_PATH}}`
  - `{{ITEM_NAME}}`
  - `{{ITEM_EXT}}` (e.g., "md", "canvas", "js", etc.)

- **Before / After Each Link**  
  Text inserted before/after each *linked* file’s content. Can use placeholders including:
  - `{{LINK_PATH}}`
  - `{{LINK_NAME}}`
  - `{{LINK_TYPE}}` (e.g., "OUTLINK", "INLINK")
  - `{{LINK_ITEM_PATH}}`
  - `{{LINK_ITEM_NAME}}`

---

## Formatting

When you copy folder contents, open files, or build a custom set of notes, the output might look like:

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

For open or selected files, the format is similar:

```
Open Files Contents:
----------------------
/<file_path>
-----------------------
<file_content>
-----------------------
```

These sections can also include your custom “before/after” text, placeholders, or any heading exclusions you defined.

---

## Example

```
# Notes
Some general notes here.

## Secret
This should be excluded.

## Visible
This will be included.
```

If you set "Secret" as an excluded heading, the **"Secret"** section won't appear when you copy this file’s contents. If you also had `*.pdf` in a `.scignore`, any PDF files in that same directory would be skipped entirely.

---

## Contributing

Feel free to open issues or submit pull requests. This plugin uses the [MIT License](LICENSE).