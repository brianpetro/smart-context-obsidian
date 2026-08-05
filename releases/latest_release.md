# Smart Context Core v3.3

## Build context by sight, not by guesswork

Before context leaves Obsidian, you should be able to answer four questions: What is included? Where did it come from? How large is it? What rules changed the result?

The redesigned Context Builder puts those answers in one place. Assemble sources from across the vault, inspect the actual tree, remove what does not belong, and copy or save only when the package looks right.

![](https://smartconnections.app/assets/context-builder-newsletter-overview-documentation-1280x720-desktop-2026-08-04.png)

> Update all installed Smart Plugins together, then restart Obsidian. Smart Context Core v3.3 requires Smart Environment v3.

## The Builder is now the workflow

The top of the Builder shows the source count, number of selections, estimated token size, and active rules. The tree shows how the package expands, how much each source contributes, and which items came from a folder, section, or saved Context.

That makes Context useful before the copy action. You can see an overgrown folder, a source that dominates the payload, or a nested section that should be removed while the structure is still easy to change.

## Add from the vault without flattening the source

Start with the current note, one block, a folder, linked notes, similar notes, a saved Context, or selected Lookup results. Drag supported items into the Builder or start typing from most places to search for the next source.

The tree keeps the origin visible. A section remains nested under its note. A named Context remains recognizable as a reusable source. The current note is easier to spot, and section or embedded-item detail stays attached when you add it.

![](https://smartconnections.app/assets/context-builder-mixed-origin-current-top-documentation-1280x720-desktop-2026-08-04.png)

## Problems surface before the handoff

Missing items are now counted and highlighted instead of disappearing quietly. When a note moved or was deleted, the Builder gives you a direct removal path. You can clean up several broken references in succession without waiting for a complete background rerender after every click.

Include and exclude rules remain visible beside the package they shape. Expand or collapse the tree, inspect the source menu on any leaf, and understand why an item is present before it becomes part of a prompt.

![](https://smartconnections.app/assets/context-builder-mixed-origin-current-bottom-documentation-1280x720-desktop-2026-08-04.png)

## Copy only when it looks right

When the source set is ready, choose the output that matches the next step:

- Copy the compiled text for a one-off prompt.
- Copy a Markdown link tree when the destination needs the source structure.
- Save the reviewed package as a named Context when the same evidence will support later work.

The copy menu, source menus, file menus, commands, and ribbon actions now use the same Smart Environment action system, so the handoff feels less like a collection of plugin-specific shortcuts.

![](https://smartconnections.app/assets/connections-context-io-to-output-100x-b05-context-codeblock-controls-editorial-publication-srgb-8df9ea54b554-2026-07-29.png)

## Smart Environment v3 makes the Builder part of the suite

The redesigned Builder sits on the same v3 foundation as Connections, Lookup, Chat, and Graph. Startup is faster, drag-and-drop preserves the source you moved, and shared menus make it easier to continue from the note or result set already in front of you.

The broader built-in embedding-model catalog and non-destructive model switching improve the semantic workflows that feed Context, while the new Environment Stats and source inspector help explain when a note was skipped, is stale, or is not embedded as expected.

Learn more about the release of [Smart Environment v3](https://smartconnections.app/smart-environment/releases/3-0/?utm_source=smart-context-release).

## Before / After

| Before | With the redesigned Context Builder |
| --- | --- |
| Context assembly and review felt like separate steps. | Add, inspect, remove, copy, and save from one visible workspace. |
| A large package was difficult to explain at a glance. | Source counts, token estimates, rules, contribution sizes, and the tree show what is actually present. |
| Nested sources could lose the reason they were included. | Notes, sections, folders, and named Contexts keep their visible origin. |
| Missing sources could fail quietly or require cleanup elsewhere. | Missing items are highlighted with a direct removal path. |
| Reusing a source set meant remembering how it was assembled. | Save the reviewed result as a named Context and use it again. |

## Supporting improvements

- Direct handoff from Smart Lookup results into the Builder.
- Identity-preserving drag and drop for supported Context and Obsidian items.
- Clearer context-management, source, file, command, ribbon, and codeblock actions.
- More consistent named-context identity across Smart Plugin workflows.
- Queued source re-imports complete before direct context copying when needed.

## Learn more

- [Smart Context overview](https://smartconnections.app/smart-context/?utm_source=smart-context-release)
- [Smart Context documentation](https://smartconnections.app/docs/context/?utm_source=smart-context-release)
- [Smart Context getting started](https://smartconnections.app/smart-context/getting-started/?utm_source=smart-context-release)
- [Smart Context FAQ](https://smartconnections.app/smart-context/faq/?utm_source=smart-context-release)

## Additional notes

Updated: copy context commands and modal to clarify text copy functionality


enhance CopyContextModal to support media copying with Shift + Select


Improved: building context from current source adds embedded and section data to context item


Refactored: codeblock menu should use context menu actions pattern


Added: copy context menu action


Improved: file-nav menu options should use menu action pattern


Migrated: commands and ribbon icons to command actions architecture


Add: implement lookup_list_send_to_smart_context action and associated menu


Add: implement drag-and-drop functionality for context items and resolve dropped item keys


Added: copy ribbon icon now opens menu


Improved: New v2 context builder UI


Add: implement rules list component with associated styles and tests


Add: implement context management actions (add, get, read, remove, create, list) and tool actions


Improved: context builder should assume search intent for keypresses outside of the name input


Improved: copy ribbon icon menu actions with sub-menus for copy types


Added: "Expand all" and "Collapse all" in context tree view


Added: include deta.settings in context copy functionality and update tests


Rename command for opening context builder to clarify functionality


Improved: context handling by introducing 'kind' property for named contexts and normalizing context item data across various modules


Updated: Smart Environment v3


Refactor context item filtering by removing exclusion checks and updating tests for clarity

Updated: 2026-08-04

[More details about the latest releases](https://smartconnections.app/smart-context/releases/3-3/?utm_source=smart-context-release)
