# Smart Context `v3.1`

> [!NOTE] What's new in `v3.1.1`
> - Added: Badges to context tree: shows when an item is included by a named context. Click the badge to view the named context that includes the item.
> - Improved: Place named context items that are grouped at the top of the contexts list
> - Improved: removal in context tree should allow multiple subsequent removals without having to wait on background precesses and rerendering.
> - Changed: Named context removal handling: When an item is included by a named context it cannot be removed without changing the named context.
> - Fixed: context codeblock items should always be treated as depth 0 non-links even if they appear in the current notes links (prevents missing expected context)
> - Fixed: Context codeblock should prevent erroneous line updates

Smart Context Core v3.1 turns more of the everyday context workflow into first-class Core features. Context codeblocks arrive in Core, named contexts become easier to reuse, and faster entry points make it simpler to build and copy the right context without breaking flow.

## Recent highlights

- Context codeblocks are now part of Smart Context Core.
- Named contexts can now be used directly from the context codeblock.
- Ribbon icons make it faster to open the builder or copy the current note with depth selection.
- A saved indicator gives clearer feedback when a named context has been stored.
- Named contexts can now be deleted from the dashboard list with the expected right-click action.
- Right-click copy for wikilink tree output in the context tree.
- [Substrate Update.](https://smartconnections.app/smart-plugins/substrate-update/)

[More details about the latest releases](https://smartconnections.app/smart-context/releases/3-1/)
