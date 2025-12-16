# Smart Context

**Feed large language models better inputs, faster.** **Smart Context *collects, cleans, and copies* every note you need** in a single click.

> Build your Context Engineering workflow with Obsidian.

> [!NOTE] Why does context matter?
> AI only answers as well as the context you provide. Smart Context helps aggregate scattered notes into templated snippets that can be quickly pasted into ChatGPT, so your prompts hit harder, your responses feel clairvoyant, and your flow state stays unbroken.

✔️ Zero-setup: works out-of-the-box
🔐 Local-first and privacy-preserving
🤖 Compatible with any AI workflow
⚔️ Mission-driven, community-supported

[![Install Smart Context](https://smartconnections.app/assets/smart-context-obsidian/smart-context.gif)](https://obsidian.md/plugins?id=smart-context)

## Getting started

1. Install Smart Context from Community plugins (or click Install above).
2. Run **Smart Context: Open Selector for New Context** to open the Builder.
3. Type to filter notes and press **Enter** to add them. Press **→** to select specific blocks when you only need sections of a note.
4. Use **Copy current to clipboard** inside the Builder to export the selection, or name the context so you can reuse it later.
5. Open **Show named contexts** to browse, reopen, or adjust saved bundles.

[![Smart Context Getting Started](https://smartconnections.app/assets/smart-context-obsidian/smart-context-getting-started.gif)](https://smartconnections.app/story/smart-context-getting-started/)

### Copy from file navigator

#### Copy a folder in one click

![Folder menu - copy contents](https://smartconnections.app/assets/smart-context-obsidian/Smart-Context-Folder-menu-copy-contents-2025-06-15.png)

Right click any folder, then choose **Copy contents** to send every note inside to your clipboard.

#### Copy multiple files

![](https://smartconnections.app/assets/context-file-nav-copy-multi-select-2025-12-16.png)

### Copy folder command

![Select folder modal](https://smartconnections.app/assets/smart-context-obsidian/Smart-Context-Select-folder-to-copy-all-contents-modal-2025-06-15.png)

Or run the command **Select folder to copy contents** from the command palette and assign a hotkey for one-touch export.

### Build a custom context with the Builder

- Run **Smart Context: Open Selector for New Context** to open the Builder modal.
- Type to filter suggestions, press **Enter** to add notes, and press **Right Arrow** to switch into block view when you only want a section.
- Remove single items with the **x** control or use **Clear** to reset; watch the total size meter to stay within token limits.
- Save a bundle by entering a name, then reopen it via **Smart Context: Open Management dashboard (show named contexts) view**.

![Context selector](https://smartconnections.app/assets/smart-context-obsidian/Smart-Context-Context-selector-with-selected-items-and-search-input-2025-06-15.png)

#### Block selection

![](https://smartconnections.app/assets/context-builder-blocks-suggested-2025-12-15.png)

### Grow the set with connections and links

![](https://smartconnections.app/assets/connections-send-to-context-2025-12-16.png)

Use **Send results to Smart Context** in Smart Connections to convert matches into a context set you can edit in the Builder.

![Select link depth modal](https://smartconnections.app/assets/smart-context-obsidian/Smart-Context-Select-link-depth-modal-2025-06-15.png)

When exporting, choose a link depth to automatically include cited sources and related topics alongside your selection.

## Key commands

- **Smart Context: Open Selector for New Context** — open the Builder for a fresh set.
- **Smart Context: Copy current to clipboard** — fast export of the current selection.
- **Smart Context: Copy entire folder to clipboard** — best when your project already lives together.
- **Smart Context: Show named contexts** — browse and reopen saved bundles.
- **Smart Context: Help: Show getting started** — pull up a quick reference inside Obsidian.

> [!TIP] Use Obsidian Settings → Hotkeys → search "Smart Context" to assign shortcuts for your most common actions.

## Templates

Open **Settings → Community plugins → Smart Context**.

![](https://smartconnections.app/assets/context-settings-page-context-templates-2025-12-15.png)

**Context templates** wrap the entire export. The default XML template includes `{{FILE_TREE}}` to show a hierarchical summary; remove it for a tighter payload.

![](https://smartconnections.app/assets/context-settings-page-item-templates-2025-12-15.png)

**Item templates** wrap each note. Useful variables: `{{KEY}}` (full path), `{{TIME_AGO}}` (last modified), and `{{LINK_DEPTH}}` (depth when including linked notes).

> Templates only affect the text you copy/export—they do not change your vault files.

## Mission-driven

The Obsidian community proved user-aligned software can out-innovate closed platforms. Smart Context embodies that spirit—open-source tools that **empower individuals**, not gatekeepers. Read about the [Smart Principles](https://smartconnections.app/smart-principles/) that guide development.

## Private by Design

No data leaves your vault unless *you* copy it. All parsing, filtering, and token estimates run locally. Use local embedding models or remote APIs—it is your choice.

## FAQs

<details><summary><span style="--font-weight: var(--h3-weight); font-variant: var(--h3-variant); letter-spacing: var(--h3-letter-spacing); line-height: var(--h3-line-height); font-size: var(--h3-size); color: var(--h3-color); font-weight: var(--font-weight); font-style: var(--h3-style); font-family: var(--h3-font); cursor: pointer;">Can I change how the context is formatted?</span></summary>Yes. Adjust the Context and Item templates in **Settings → Community plugins → Smart Context**. Edit variables like `{{FILE_TREE}}`, `{{KEY}}`, and `{{TIME_AGO}}` to match your workflow.</details>

<details><summary><span style="--font-weight: var(--h3-weight); font-variant: var(--h3-variant); letter-spacing: var(--h3-letter-spacing); line-height: var(--h3-line-height); font-size: var(--h3-size); color: var(--h3-color); font-weight: var(--font-weight); font-style: var(--h3-style); font-family: var(--h3-font); cursor: pointer;">Does it work on mobile?</span></summary>Yes, the Core Smart Context plugin is mobile friendly. **Context Pro**: some features are not compatible with mobile.</details>

<details><summary><span style="--font-weight: var(--h3-weight); font-variant: var(--h3-variant); letter-spacing: var(--h3-letter-spacing); line-height: var(--h3-line-height); font-size: var(--h3-size); color: var(--h3-color); font-weight: var(--font-weight); font-style: var(--h3-style); font-family: var(--h3-font); cursor: pointer;">What is the Smart Ecosystem?</span></summary>
Smart Context is one piece of a larger ecosystem of local first, user aligned tools.
I build Smart Plugins to explore new ideas, ship practical workflows, and keep complexity manageable inside Obsidian. Smart Context is the piece that enables Context Engineering inside Obsidian.
</details>

## Thanks to the Community

Your feedback and support keep the project alive—thank you! 🌴
