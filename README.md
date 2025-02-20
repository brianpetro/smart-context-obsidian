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


---

## Usage

### Main Commands (Command Palette)

3. **Copy Visible Open Files Content to Clipboard**  
   - Copies only the content from currently visible (active) panes.

4. **Copy All Open Files Content to Clipboard**  
   - Copies content from every open file in the workspace.

5. **Copy Visible Open Files Content (With Linked Files) to Clipboard**  
   - Same as #3 but also includes files they link to (recursively).

6. **Copy All Open Files Content (With Linked Files) to Clipboard**  
   - Same as #4 but also includes files they link to (recursively).

### Context Menu on Folders
- Right-click a folder in Obsidian’s File Explorer.  
- Select **"Copy folder contents to clipboard"** to quickly gather the folder's files.

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
  - `{{ITEM_DEPTH}}` (e.g., "1", "2", "3", etc.)

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

If you set "Secret" as an excluded heading, the **"Secret"** section won't appear when you copy this file’s contents.

## Contributing

Feel free to open issues or submit pull requests. This plugin uses the [MIT License](LICENSE).