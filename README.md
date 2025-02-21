# Smart Context Plugin for Obsidian

Smart Context is an Obsidian plugin that helps you copy contents from folders, open files, and linked notes, with advanced configuration like excluding specific heading sections. This is particularly useful when working with AI tools like ChatGPT, letting you feed large sets of project notes, research, or documentation as 'context' to improve AI responses and accuracy.


## Features

- **Copy Folder Contents**  
  Copy all Markdown (and Canvas) files from a selected folder to your clipboard, optionally including the folder tree. Perfect for quickly giving AI models an entire project's context.

- **Copy Visible Open Files**  
  Copy content from only the currently visible open files, so you can provide precisely the subset of notes you are focusing on to ChatGPT or other tools.

- **Copy All Open Files**  
  Gather content from every open file in the workspace (regardless of visibility) at once.

- **Exclude Sections by Heading**  
  Configure specific headings (glob patterns) to exclude. For example, headings named 'Secret' or 'Confidential' can automatically be removed before the content is copied.

- **Copy folder contents to clipboard** 
  Right-click a folder in Obsidian's File Explorer and select 'Copy folder contents to clipboard' to quickly gather the folder's files.

![Smart Context - Copy folder menu option](./assets/Smart%20Context%20-%20Copy%20folder%20menu%20option.png)

## Getting Started

[![Smart Context Getting Started](./assets/smart-context-getting_started.gif)](https://docs.smartconnections.app/Smart-Context/Getting-Started)

Read the [Getting Started Guide](https://docs.smartconnections.app/Smart-Context/Getting-Started) for more information.

### Real-World Use Case

A developer wants to paste relevant code files, readme content, and design docs into ChatGPT for help. They do not want to manually open and copy each file, nor reveal sensitive or excluded headings. Smart Context solves it in a few clicks.


## Settings

In Settings → Community Plugins → Smart Context, you can configure:

- **Excluded Headings**  
  Array of headings (supports glob patterns, e.g. '*Secret*') to remove from the copied text.

- **In-links**  
  Whether to include notes that link into your selected file(s).

- **Before / After Context**  
  Custom text inserted at the very beginning or end of the final copied content. Supports placeholders like '{{FILE_TREE}}'.

- **Before / After Each Item**  
  Text inserted before/after each primary file's content. Useful placeholders include:
  - '{{ITEM_PATH}}'
  - '{{ITEM_NAME}}'
  - '{{ITEM_EXT}}'
  - '{{ITEM_DEPTH}}'

## Formatting

When you copy folder contents, open files, or build a custom set of notes, the output might look like:

```
<folder_name> Folder Structure:
<tree_structure>

File Contents:
----------------------
/<relative_file_path>
----------------------
<file_content>
----------------------
```

For open or selected files, the format is similar:

```
Open Files Contents:
----------------------
/<file_path>
----------------------
<file_content>
----------------------
```

These sections can also include custom 'before/after' text, placeholders, or any heading exclusions you define.

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

If you set 'Secret' as an excluded heading, the 'Secret' section will not appear when you copy this file's content.

---

## Contributing

Feel free to open issues or submit pull requests. This plugin uses the [MIT License](LICENSE).