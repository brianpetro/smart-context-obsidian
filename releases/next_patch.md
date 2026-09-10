### Know what's in your context

The redesigned Builder makes it easier to review your sources before copying. Open a saved Context from its badge, see its changes reflected in the tree, and remove several items in a row without waiting for the view to reload. Missing sources are highlighted with an option to remove them.

![[context-builder-current-sanitized-documentation-1280x450-desktop-2026-08-06.png]]

*Review the source tree, size estimate, and copy controls in one place. This capture also includes Pro source modes.*

### Copy your latest changes

Before copying context to the clipboard, Smart Context now processes queued note updates. The output and link tree also identify the current file, so you can see how it fits into the context you're sharing.

### Follow links, then refine the selection

Hold Cmd on macOS or Ctrl on Windows/Linux while selecting a link depth to open the items through that depth as a new Context in the Builder. Adjust the selection there before copying.

![[context-depth-current-documentation-1200x800-desktop-2026-08-05.png]]

*Each depth shows its expected characters, tokens, and item count before you choose.*

Saved Contexts are easier to maintain, too: edit their descriptions directly in the list, without the description control cutting off their names.

### Full release notes

#### Builder and saved Contexts

- Redesigned the Context Builder with the v2 interface used by Core and Pro.
- Named Context badges in the tree now open the included Context.
- The tree refreshes when an included named Context changes.
- Remove several items in succession without waiting for background processing and a full redraw after each removal.
- Missing items are highlighted in the Builder, with a notification that offers to remove them.
- Item removal now handles differences in path formatting more consistently, with automated checks for path normalization and matching.
- Hold Cmd on macOS or Ctrl on Windows/Linux while selecting a link depth to open all items through that depth as a new Context in the Builder.
- Edit descriptions directly in the named Contexts list. The **Add description** control no longer cuts off Context names.
- Context suggestions now support source filters.

#### Copying and output

- Clipboard copies process queued source updates before compiling the text. An information notice appears only when updates are waiting.
- Context output and the link tree now identify the current file.
- Context-output templates preserve the section reference when an item links to a specific part of a note.
- Context menus now include options to clear the selection, copy the link tree, and copy the text to the clipboard.
- Individual items in the context tree now provide context-item and source menus.
- Markdown context-tree output now supports filtering, with automated checks.

#### Integrations and maintenance

- Updated the Connections-to-Context handoff to remain compatible with the revised Connections integration.
- Removed exclusion metadata from stored context items.
