Improved: added missing context item handling: missing items are now highlighted in the builder and a notification is emitted with option to remove the missing item

Improved: Run re-import prior to opening source-based context to prevent missing links added sindce last import (so that items surfaced at various depths are accurate)


Improved: Run queued source re-imports prior to building source-based copy contexts and show an info notice only when has queued changes.

Added: current file now indicated in content copied to clipboard (included in link tree and default context item wrapper template).

Improved: handling of missing named contexts that are still included in a codeblock/context: now emits a notification with option to remove (similar to other missing context item types).