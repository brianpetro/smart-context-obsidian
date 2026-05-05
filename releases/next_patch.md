

Improved: Place named context items that are grouped at the top of the contexts list


Fixed: context codeblock items should always be treated as depth 0 non-links even if they appear in the current notes links (prevents missing expected context)

Improved: removal in context tree should allow multiple subsequent removals without having to wait on background precesses and rerendering.

Changed: Named context removal handling: When an item is included by a named context it cannot be removed without changing the named context.